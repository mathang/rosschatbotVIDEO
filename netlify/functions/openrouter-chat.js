// netlify/functions/openrouter-chat.js
// Netlify function (ESM)

export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error:
          "OPENROUTER_API_KEY is not set on the server. Configure it in Netlify environment variables.",
      }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const { messages, stream: streamRequested, plugins } = body || {};
  if (!Array.isArray(messages)) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing 'messages' array" }),
    };
  }

  const buildFallbackChunk = (content, model) =>
    `data: ${JSON.stringify({
      id: "fallback-notice",
      object: "chat.completion.chunk",
      model,
      choices: [
        {
          index: 0,
          delta: { content },
          finish_reason: null,
        },
      ],
    })}\n\n`;

  const models = [
    "google/gemini-2.5-flash-lite",
    "google/gemini-3-flash-preview",
    "google/gemma-3-27b-it:free",
    "openai/gpt-oss-20b:free",
  ];

  const fallbackNotice =
    "my usual model is struggling with this one - I'm switching to another one. I'll respond soon!";

  const makeOpenRouterRequest = async (model, wantsStream) => {
    const payload = {
      model,
      messages,
      temperature: 0.4,
    };

    if (Array.isArray(plugins) && plugins.length) {
      payload.plugins = plugins;
    }

    if (wantsStream) {
      payload.stream = true;
      payload.stream_options = { include_usage: true };
    }

    return fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://openrouterchatbot.netlify.app",
        "X-Title": "AI Tools Teaching Chatbot",
      },
      body: JSON.stringify(payload),
    });
  };

  let lastError = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];

    try {
      const openrouterRes = await makeOpenRouterRequest(
        model,
        !!streamRequested
      );

      if (!openrouterRes.ok) {
        const text = await openrouterRes.text();
        let data = null;
        try {
          data = JSON.parse(text);
        } catch (e) {
          // Non-JSON from OpenRouter
        }

        console.error(`OpenRouter error for ${model}:`, data || text);
        lastError = {
          status: openrouterRes.status,
          body: data || text || "Unknown error",
        };
        continue;
      }

      const rawText = await openrouterRes.text();

      // STREAMING PATH (passthrough SSE payload)
      if (streamRequested) {
        const headers = {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        };

        const bodyText =
          i > 0 ? `${buildFallbackChunk(fallbackNotice, model)}${rawText}` : rawText;

        return {
          statusCode: 200,
          headers,
          body: bodyText,
        };
      }

      // NON-STREAMING PATH (legacy)
      const text = rawText;
      let data = null;
      try {
        data = JSON.parse(text);
      } catch (e) {
        // Non-JSON from OpenRouter
      }

      const usingFallback = i > 0;
      if (usingFallback) {
        const existingContent = data?.choices?.[0]?.message?.content;
        const combinedContent = existingContent
          ? `${fallbackNotice}\n\n${existingContent}`
          : fallbackNotice;

        if (data && Array.isArray(data.choices) && data.choices[0]?.message) {
          data.choices[0].message.content = combinedContent;
        } else {
          data = {
            choices: [
              {
                message: {
                  role: "assistant",
                  content: combinedContent,
                },
              },
            ],
          };
        }
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data ?? { raw: text }),
      };
    } catch (err) {
      console.error(`OpenRouter request failed for ${model}:`, err);
      lastError = { status: 502, body: err.message || "Unknown error" };
      // Try the next model
    }
  }

  // If all models failed
  const errorBody =
    (lastError && (lastError.body?.error || lastError.body)) ||
    "Failed to contact any OpenRouter model.";

  return {
    statusCode: lastError?.status || 502,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: errorBody }),
  };
};
