import admin from "firebase-admin";

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { userId, role, content, timestamp } = JSON.parse(event.body);

    await db.collection("chat_logs").add({
      userId: userId || "anonymous",
      role,
      content,
      timestamp: timestamp || new Date().toISOString(),
    });

    return { statusCode: 200, body: JSON.stringify({ status: "logged" }) };
  } catch (error) {
    console.error("Firebase Logging Error:", error);
    return { statusCode: 500, body: error.message };
  }
};
