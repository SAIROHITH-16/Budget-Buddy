// src/api.ts
// Full manual Axios instance with Firebase ID-token interceptor.
// No template. No boilerplate shortcut. Every interceptor is written explicitly.
//
// How it works:
//   REQUEST interceptor:
//     - Before each outgoing request, asks Firebase for the current user's ID token.
//     - Firebase returns the cached token if still valid, or silently refreshes it.
//     - The token is attached as `Authorization: Bearer <token>` header.
//     - If no user is signed in, the request is sent without the header (the server
//       will reject it with 401 for protected routes, which is the correct behaviour).
//
//   RESPONSE interceptor:
//     - On any successful response, passes it through unchanged.
//     - On error responses:
//         401  → the token may have expired or be invalid; logs a warning.
//         403  → user is authenticated but not authorised for this resource.
//         500+ → server error; logs for debugging.
//     - Always re-throws so the calling code can handle the error in its own try/catch.

import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";
import { auth } from "@/firebase";

// ---------------------------------------------------------------------------
// 1. Create the Axios instance with base configuration
// ---------------------------------------------------------------------------

// Resolve the API base URL dynamically so the app works whether opened via
// "localhost" or a LAN IP address (e.g. http://192.168.1.x:8081).
// Priority: explicit VITE_API_URL env var → same host as the page on port 3001.
function resolveBaseURL(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;
  // In the browser, use the same host/IP the page was loaded from
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:3001/api`;
  }
  return "http://localhost:3001/api";
}

const api: AxiosInstance = axios.create({
  baseURL: resolveBaseURL(),

  // All request bodies are JSON
  headers: {
    "Content-Type": "application/json",
  },

  // 30-second timeout — Firebase token refresh + server key fetch can take ~5-10s
  // on slow connections; 10s proved too tight in practice.
  timeout: 30_000,
});

// ---------------------------------------------------------------------------
// 2. REQUEST interceptor — attach Firebase ID token to every outgoing request
// ---------------------------------------------------------------------------
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> => {
    // Check if Firebase has a currently authenticated user
    const firebaseUser = auth.currentUser;

    if (firebaseUser) {
      try {
        // getIdToken(false) → returns cached token unless near expiry.
        // Firebase automatically handles token refresh under the hood.
        const token: string = await firebaseUser.getIdToken(false);

        // Attach the token as a Bearer token in the Authorization header.
        // Express middleware (verifyToken.js) reads this header to authenticate requests.
        config.headers.Authorization = `Bearer ${token}`;
      } catch (tokenError) {
        // Failed to get token — could mean the session is invalid.
        // Log the error and proceed without the token so the server returns 401.
        console.error(
          "[api] Failed to retrieve Firebase ID token for request:",
          tokenError
        );
      }
    }
    // If no user is logged in, no Authorization header is added.
    // The server will respond with 401 for protected endpoints.
    return config;
  },
  (error: AxiosError) => {
    // Request could not be built at all (e.g., bad config) — reject immediately
    console.error("[api] Request setup error:", error);
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// 3. RESPONSE interceptor — handle error responses globally
// ---------------------------------------------------------------------------
api.interceptors.response.use(
  // 3a. Successful response (2xx) — pass through unchanged
  (response: AxiosResponse): AxiosResponse => {
    return response;
  },

  // 3b. Error response — handle specific HTTP status codes
  (error: AxiosError): Promise<never> => {
    if (error.response) {
      // The server responded with a status code outside 2xx
      const { status, data } = error.response;

      if (status === 401) {
        // Token missing, expired, or invalid.
        // The server's verifyToken middleware sends this when auth fails.
        console.warn(
          "[api] 401 Unauthorised — Firebase token may be missing or expired. " +
            "The user may need to sign in again."
        );
      } else if (status === 403) {
        // Authenticated but not permitted to access this resource
        console.warn("[api] 403 Forbidden — user lacks permission for this resource.");
      } else if (status >= 500) {
        // Server-side error
        console.error(`[api] Server error ${status}:`, data);
      }
    } else if (error.request) {
      // Request was made but no response received (network error, timeout, etc.)
      console.error(
        "[api] No response received — check that the Express server is running at",
        import.meta.env.VITE_API_URL || "http://localhost:3001/api"
      );
    } else {
      // Something went wrong setting up the request itself
      console.error("[api] Request error:", error.message);
    }

    // Always re-throw so individual callers (hooks, pages) can handle the error
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// 4. Export the configured Axios instance as the default export
//    Import it in hooks/pages as: import api from "@/api";
// ---------------------------------------------------------------------------
export default api;
