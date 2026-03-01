// server/firebaseAdmin.js
// Full manual Firebase Admin SDK initialisation.
// No template. No scaffold. Every line is explicit.
//
// The Admin SDK is used ONLY on the server to:
//   1. Verify Firebase ID tokens sent from the React frontend.
//   2. Decode the token payload to extract the user's uid.
//
// This file initialises the Admin app ONCE and exports the `auth` service.
// All other server files import from here.
//
// Setup:
//   Place your Firebase service account credentials in server/.env:
//     FIREBASE_PROJECT_ID=your-project-id
//     FIREBASE_PRIVATE_KEY_ID=your-private-key-id
//     FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
//     FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
//     FIREBASE_CLIENT_ID=your-client-id
//
//   Download the JSON from Firebase console:
//     Project settings → Service accounts → Generate new private key

"use strict";

const admin = require("firebase-admin");

// ---------------------------------------------------------------------------
// 1. Build the service account credential object from environment variables.
//    We do NOT hard-code credentials — they are read from the .env file which
//    must NEVER be committed to version control.
// ---------------------------------------------------------------------------
const serviceAccountCredential = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  // The private key is stored with literal \n in .env — replace them with real newlines.
  private_key: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(
    process.env.FIREBASE_CLIENT_EMAIL || ""
  )}`,
};

// ---------------------------------------------------------------------------
// 2. Initialise the Firebase Admin app.
//    admin.apps.length check prevents "already initialised" errors if this
//    module is required more than once (e.g., during hot-reload in development).
// ---------------------------------------------------------------------------
if (admin.apps.length === 0) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountCredential),
    });
    console.log("[firebaseAdmin] Firebase Admin SDK initialised successfully.");
  } catch (err) {
    console.warn("[firebaseAdmin] WARNING: Firebase Admin SDK failed to initialise.");
    console.warn("[firebaseAdmin] Reason:", err.message);
    console.warn("[firebaseAdmin] Add your Firebase service account credentials to server/.env to enable auth.");
  }
} else {
  console.log("[firebaseAdmin] Firebase Admin SDK already initialised — reusing existing app.");
}

// ---------------------------------------------------------------------------
// 3. Export the Auth service so middleware can call admin.auth().verifyIdToken()
//    Returns null if Firebase Admin failed to initialise (missing credentials).
// ---------------------------------------------------------------------------
let adminAuth = null;
try {
  adminAuth = admin.auth();
} catch (err) {
  console.warn("[firebaseAdmin] admin.auth() unavailable — Firebase not initialised.");
}

module.exports = { admin, adminAuth };
