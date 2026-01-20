import { Client } from "@gradio/client";

/**
 * Netlify Function: hf-tts
 * Handles communication with Hugging Face Kokoro-TTS Space
 * IMPORTANT: Ensure package.json has "type": "module" and "@gradio/client" dependency.
 */
let cachedAppPromise;

const getHfApp = async () => {
  if (!cachedAppPromise) {
    const hfToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN;
    cachedAppPromise = hfToken
      ? Client.connect("https://deaconhead-kokoro-tts.hf.space", {
          hf_token: hfToken,
        })
      : Client.connect("https://deaconhead-kokoro-tts.hf.space");
  }

  return cachedAppPromise;
};

export const handler = async (event) => {
  // CORS Preflight handling
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { text, voice = "af_bella", speed = 1.0 } = JSON.parse(event.body);

    if (!text) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Text is required" }),
      };
    }

    console.log(`Connecting to Kokoro-TTS for text: "${text.substring(0, 20)}..."`);

    const hfToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN;
    const app = await getHfApp();

    const paddedText = " . ." + text; 
    const result = await app.predict("/predict", [paddedText, voice, parseFloat(speed)]);

    
    if (!result.data || !result.data[0]) {
      throw new Error("No audio data returned from Hugging Face.");
    }

    const audioUrl = result.data[0].url;

    // MODIFIED: Include the Authorization header to download from a Private Space
    const audioResponse = await fetch(audioUrl, {
      headers: hfToken
        ? {
            Authorization: `Bearer ${hfToken}`,
          }
        : undefined,
    });

    if (!audioResponse.ok) {
      // Enhanced error logging to help you debug
      const errorDetail = await audioResponse.text();
      console.error("HF File Download Error:", errorDetail);
      throw new Error(`Failed to fetch audio file from HF: ${audioResponse.status}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Access-Control-Allow-Origin": "*",
      },
      body: Buffer.from(audioBuffer).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error("TTS Function Error:", error.message);

    // Check for common Netlify/HF timeout patterns
    const isTimeout =
      error.message.toLowerCase().includes("timeout") ||
      error.message.toLowerCase().includes("fetch");

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: isTimeout
          ? "Hugging Face Space is waking up. Please try again in 30 seconds."
          : error.message,
        type: "TTS_ERROR",
      }),
    };
  }
};
