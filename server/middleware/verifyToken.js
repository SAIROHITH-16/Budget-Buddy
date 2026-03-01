// server/middleware/verifyToken.js
// Full manual implementation of Firebase ID token verification middleware.
// No template. No scaffold. Every line is explicit.
//
// How it works:
//   1. Reads the `Authorization` header from the incoming HTTP request.
//   2. Validates that the header is in the format: "Bearer <idToken>".
//   3. Calls Firebase Admin's verifyIdToken() which:
//        a. Downloads (and caches) Firebase's public keys.
//        b. Verifies the JWT signature against those keys.
//        c. Checks that the token has not expired.
//        d. Confirms the token belongs to this Firebase project.
//   4. On success: attaches the decoded token payload to req.user and
//      calls next() to pass control to the route handler.
//   5. On failure: responds with 401 Unauthorised and a JSON error body.
//
// Usage in routes:
//   const verifyToken = require("../middleware/verifyToken");
//   router.get("/transactions", verifyToken, async (req, res) => { ... });
//
// After verifyToken runs, route handlers have access to:
//   req.user.uid        — the Firebase user's unique ID (string)
//   req.user.email      — the user's email address (may be undefined for phone auth)
//   req.user.name       — the user's display name (if set)

"use strict";

const { adminAuth } = require("../firebaseAdmin");

// Guard: if Firebase Admin isn't initialised, reject all requests immediately
if (!adminAuth) {
  console.error("[verifyToken] Firebase Admin not initialised — add service account credentials to server/.env");
}

/**
 * Express middleware that verifies the Firebase ID token.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function verifyToken(req, res, next) {
  // Guard: Firebase Admin not configured
  if (!adminAuth) {
    return res.status(503).json({
      success: false,
      message: "Server misconfigured: Firebase Admin credentials are missing in server/.env",
    });
  }

  // -------------------------------------------------------------------------
  // Step 1: Extract the Authorization header
  // -------------------------------------------------------------------------
  const authorizationHeader = req.headers["authorization"];

  if (!authorizationHeader) {
    return res.status(401).json({
      success: false,
      message: "Unauthorised: Authorization header is missing.",
    });
  }

  // -------------------------------------------------------------------------
  // Step 2: Validate the "Bearer <token>" format
  // The header must start with "Bearer " (with a space) followed by the JWT.
  // -------------------------------------------------------------------------
  if (!authorizationHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message:
        "Unauthorised: Authorization header must use the Bearer scheme. " +
        "Expected: Authorization: Bearer <Firebase-ID-Token>",
    });
  }

  // Extract the raw JWT string (everything after "Bearer ")
  const idToken = authorizationHeader.slice(7).trim();

  if (!idToken) {
    return res.status(401).json({
      success: false,
      message: "Unauthorised: Bearer token is empty.",
    });
  }

  // -------------------------------------------------------------------------
  // Step 3: Verify the token with Firebase Admin SDK
  // adminAuth.verifyIdToken() performs full JWT verification:
  //   - Signature verification using Firebase's public RSA keys
  //   - Token expiry check (Firebase tokens expire after 1 hour)
  //   - Audience/issuer validation (ensures token belongs to this project)
  // -------------------------------------------------------------------------
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    // -------------------------------------------------------------------------
    // Step 4: Attach the decoded token payload to req.user
    // This makes req.user.uid and req.user.email available in downstream handlers.
    // -------------------------------------------------------------------------
    req.user = {
      uid: decodedToken.uid,            // Firebase user ID — use this as the owner key in MongoDB
      email: decodedToken.email ?? null, // Email (null for phone-only accounts)
      name: decodedToken.name ?? null,   // Display name (set in Firebase profile)
      emailVerified: decodedToken.email_verified ?? false,
    };

    // Log for debugging — remove or disable in production
    console.log(`[verifyToken] Token verified for uid: ${req.user.uid}`);

    // -------------------------------------------------------------------------
    // Step 5: Pass control to the next middleware / route handler
    // -------------------------------------------------------------------------
    next();
  } catch (error) {
    // -------------------------------------------------------------------------
    // Step 6: Handle verification errors
    // -------------------------------------------------------------------------

    // Firebase Admin throws specific error codes for different failure cases
    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({
        success: false,
        message: "Unauthorised: Firebase ID token has expired. Please sign in again.",
        code: "TOKEN_EXPIRED",
      });
    }

    if (error.code === "auth/id-token-revoked") {
      return res.status(401).json({
        success: false,
        message:
          "Unauthorised: Firebase ID token has been revoked. Please sign in again.",
        code: "TOKEN_REVOKED",
      });
    }

    if (error.code === "auth/argument-error") {
      return res.status(401).json({
        success: false,
        message: "Unauthorised: Malformed ID token. Token is not a valid JWT.",
        code: "TOKEN_MALFORMED",
      });
    }

    if (
      error.code === "auth/project-not-found" ||
      error.code === "auth/invalid-credential"
    ) {
      console.error(
        "[verifyToken] Firebase Admin credential error — check FIREBASE_* env vars:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: "Server configuration error: Firebase Admin is not configured correctly.",
      });
    }

    // Catch-all for any other Firebase or unexpected errors
    console.error("[verifyToken] Token verification failed:", error);
    return res.status(401).json({
      success: false,
      message: "Unauthorised: Token verification failed.",
      code: "TOKEN_INVALID",
    });
  }
}

module.exports = verifyToken;
