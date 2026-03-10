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
  // 1. Explicit override (baked in at Vite build time) — highest priority.
  //    Set VITE_API_URL in Vercel / Railway / your CI environment.
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;

  // 2. Development: the Vite dev server proxies /api → localhost:3001,
  //    so a relative path is all we need.
  if (import.meta.env.DEV) return "/api";

  // 3. Production fallback: use a relative /api path.
  //    For this to work on Vercel you must add an API proxy rewrite in
  //    vercel.json  OR  set VITE_API_URL to your backend's full URL.
  //    Without one of those, every API call will 404.
  if (import.meta.env.PROD) {
    console.warn(
      "[api] VITE_API_URL is not set. API calls will use /api (relative).\n" +
      "      Add VITE_API_URL=https://your-backend-url/api to your Vercel" +
      " environment variables, or add an API proxy rewrite to vercel.json."
    );
    return "/api";
  }

  return "/api";
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
      } catch {
        // First attempt failed (e.g. net::ERR_NETWORK_CHANGED).
        // Try a forced refresh once before giving up.
        try {
          const token: string = await firebaseUser.getIdToken(true);
          config.headers.Authorization = `Bearer ${token}`;
        } catch (tokenError) {
          // Both attempts failed — log and proceed without token so the
          // server returns 401 rather than hanging indefinitely.
          console.error(
            "[api] Failed to retrieve Firebase ID token for request:",
            tokenError
          );
        }
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

  // 3b. Error response — handle specific HTTP status codes.
  // On a 401, attempt a single automatic retry with a force-refreshed Firebase token
  // (handles the case where the cached token expired between page load and first request).
  async (error: AxiosError): Promise<AxiosResponse | never> => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true; // prevent infinite retry loop

      const firebaseUser = auth.currentUser;
      if (firebaseUser) {
        try {
          // Force a fresh token — bypasses Firebase's local cache
          const freshToken = await firebaseUser.getIdToken(/* forceRefresh */ true);
          originalRequest.headers["Authorization"] = `Bearer ${freshToken}`;
          console.warn("[api] 401 received — retrying with force-refreshed Firebase token.");
          return api(originalRequest);
        } catch (refreshError) {
          console.error("[api] Token force-refresh failed — user may need to sign in again:", refreshError);
        }
      } else {
        console.warn("[api] 401 received — no active Firebase user. User may need to sign in.");
      }
    } else if (error.response) {
      const { status, data } = error.response;
      if (status === 403) {
        console.warn("[api] 403 Forbidden — user lacks permission for this resource.");
      } else if (status >= 500) {
        console.error(`[api] Server error ${status}:`, data);
      }
    } else if (error.request) {
      // Request was made but no response received (network error, timeout, etc.)
      console.error(
        "[api] No response received — check that the Express server is running at",
        import.meta.env.VITE_API_URL || "http://localhost:3001/api"
      );
    } else {
      console.error("[api] Request setup error:", error.message);
    }

    // Re-throw so individual callers (hooks, pages) can handle the error
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// 4. Export the configured Axios instance as the default export
//    Import it in hooks/pages as: import api from "@/api";
// ---------------------------------------------------------------------------
export default api;
