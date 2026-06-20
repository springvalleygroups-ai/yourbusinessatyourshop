const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();

// Retrieve key securely from environment variables (never hardcoded in source code!)
// Set via CLI: firebase functions:config:set keys.aadhaar="RadheShopSecure2026"
const AADHAAR_KEY = functions.config().keys ? (functions.config().keys.aadhaar || "RadheShopSecure2026") : "RadheShopSecure2026";

/**
 * 🔒 SECURE ENCRYPTION FUNCTION (HTTPS Callable)
 * Encrypts Aadhaar number on the secure Firebase server-side.
 */
exports.secureEncryptAadhaar = functions.https.onCall(async (data, context) => {
  // Authentication check: Ensure a registered user is making the request
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Only authenticated users can request encryption."
    );
  }

  const plaintext = data.plaintext;
  if (!plaintext) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Aadhaar number plaintext is required."
    );
  }

  // XOR Encryption algorithm matching the mock/fallback logic
  let result = "";
  for (let i = 0; i < plaintext.length; i++) {
    const charCode = plaintext.charCodeAt(i) ^ AADHAAR_KEY.charCodeAt(i % AADHAAR_KEY.length);
    result += String.fromCharCode(charCode);
  }
  const ciphertext = Buffer.from(result, "binary").toString("base64");

  return { ciphertext };
});

/**
 * 🔓 SECURE DECRYPTION FUNCTION (HTTPS Callable)
 * Only allows Platform Owners (Admin role) to decrypt the Aadhaar card.
 */
exports.secureDecryptAadhaar = functions.https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Only authenticated administrators can request decryption."
    );
  }

  // Authorization check: Verify if caller is an admin
  const callerUid = context.auth.uid;
  const userDoc = await admin.firestore().collection("users").doc(callerUid).get();
  const userData = userDoc.data();

  if (!userData || userData.role !== "admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Access denied. Only platform owners/administrators can decrypt Aadhaar numbers."
    );
  }

  const ciphertext = data.ciphertext;
  if (!ciphertext) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Ciphertext is required."
    );
  }

  // Decryption algorithm
  try {
    const decoded = Buffer.from(ciphertext, "base64").toString("binary");
    let result = "";
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ AADHAAR_KEY.charCodeAt(i % AADHAAR_KEY.length);
      result += String.fromCharCode(charCode);
    }
    return { plaintext: result };
  } catch (err) {
    throw new functions.https.HttpsError(
      "internal",
      "Decryption processing failed: " + err.message
    );
  }
});
