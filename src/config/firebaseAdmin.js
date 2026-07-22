const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const file = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "firebase-service-account.json";
const candidates = [
  path.resolve(file),
  path.resolve(__dirname, file),
  path.resolve(__dirname, "..", file),
  path.resolve(__dirname, "../..", file),
  path.resolve(__dirname, "../../firebase-service-account.json"),
  path.resolve(__dirname, "../firebase-service-account.json"),
];

const actualPath = candidates.find((p) => {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
});

if (actualPath) {
  try {
    const serviceAccount = require(actualPath);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
  } catch (err) {
    console.error("[FCM] firebaseAdmin config error:", err.message);
  }
}

module.exports = admin;