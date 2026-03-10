// src/context/AuthContext.tsx
// Full manual implementation of Firebase Auth context.
// No template. No preset. Every line is explicit.
//
// Provides:
//   currentUser   – the Firebase User object (or null when signed-out)
//   idToken       – the raw JWT string for attaching to backend requests
//   loading       – true while Firebase resolves the initial auth state
//   signInEmail   – email+password sign-in
//   signUpEmail   – email+password registration
//   signInGoogle  – Google popup sign-in
//   signOutUser   – sign out

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  type User,
  type UserCredential,
  loginWithEmail,
  registerWithEmail,
  loginWithGoogle,
  logout,
  resetPassword,
  subscribeToAuthChanges,
  auth,
} from "@/firebase";
import api from "@/api";

// ---------------------------------------------------------------------------
// 1. Shape of the context value
// ---------------------------------------------------------------------------
interface AuthContextValue {
  /** The currently authenticated Firebase user, or null if signed out. */
  currentUser: User | null;
  /**
   * The Firebase ID token (JWT) for the current user.
   * Refreshed automatically by Firebase before expiry.
   * Pass this as `Authorization: Bearer <idToken>` in API calls.
   */
  idToken: string | null;
  /** True while the initial auth state is being resolved from Firebase. */
  loading: boolean;
  /** Sign in with email and password. Throws FirebaseError on failure. */
  signInEmail: (email: string, password: string) => Promise<UserCredential>;
  /** Create a new account with email and password. Throws FirebaseError on failure. */
  signUpEmail: (email: string, password: string) => Promise<UserCredential>;
  /** Sign in via Google popup. Throws FirebaseError on failure. */
  signInGoogle: () => Promise<UserCredential>;
  /** Sign out the current user. */
  signOutUser: () => Promise<void>;
  /** Send a password reset email to the given email address. */
  sendPasswordReset: (email: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// 2. Create context with a null default (guarded by the provider check below)
// ---------------------------------------------------------------------------
const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// 3. Provider component — mounts at the top of the React tree
// ---------------------------------------------------------------------------
interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // -------------------------------------------------------------------------
  // 3a. Subscribe to Firebase auth-state changes once on mount.
  //     When the user signs in or out, Firebase calls this callback.
  //     We also fetch the fresh ID token on every state change so that
  //     the Axios interceptor always has a valid JWT.
  // -------------------------------------------------------------------------
  useEffect(() => {
    // subscribeToAuthChanges returns the unsubscribe function
    const unsubscribe = subscribeToAuthChanges(async (firebaseUser) => {
      setCurrentUser(firebaseUser);

      if (firebaseUser) {
        // forceRefresh=false → Firebase returns cached token unless near expiry
        // Firebase automatically refreshes the token ~5 min before it expires.
        try {
          const token = await firebaseUser.getIdToken(/* forceRefresh */ false);
          setIdToken(token);

          // Store token for API testing in dev mode
          if (import.meta.env.DEV) {
            (window as any).__firebaseToken = token;
          }

          // Sync user record to the backend DB on every sign-in.
          // Fire-and-forget — never blocks the UI, never throws to the user.
          api.post("/auth/firebase-login").catch(() => {});
        } catch (err) {
          console.error("[AuthContext] Failed to retrieve ID token:", err);
          setIdToken(null);
        }
      } else {
        // User signed out — clear the token
        setIdToken(null);
      }

      // Auth state is now resolved; stop showing the global loading state
      setLoading(false);
    });

    // Cleanup: unsubscribe from Firebase listener when provider unmounts
    return () => unsubscribe();
  }, []);

  // -------------------------------------------------------------------------
  // 3b. Token refresh subscription.
  //     Firebase fires onIdTokenChanged whenever the token is refreshed.
  //     We sync that new token into state so Axios always uses the latest one.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const unsubscribeToken = auth.onIdTokenChanged(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken(false);
          setIdToken(token);
        } catch {
          setIdToken(null);
        }
      } else {
        setIdToken(null);
      }
    });

    return () => unsubscribeToken();
  }, []);

  // -------------------------------------------------------------------------
  // 3c. Auth action helpers — thin wrappers so callers do not import firebase.ts
  // -------------------------------------------------------------------------
  const signInEmail = useCallback(
    (email: string, password: string): Promise<UserCredential> => {
      return loginWithEmail(email, password);
    },
    []
  );

  const signUpEmail = useCallback(
    (email: string, password: string): Promise<UserCredential> => {
      return registerWithEmail(email, password);
    },
    []
  );

  const signInGoogle = useCallback((): Promise<UserCredential> => {
    return loginWithGoogle();
  }, []);

  const signOutUser = useCallback(async (): Promise<void> => {
    await logout();
    // State is cleared automatically by the onAuthStateChanged listener above
  }, []);

  const sendPasswordReset = useCallback(async (email: string): Promise<void> => {
    await resetPassword(email);
  }, []);

  // -------------------------------------------------------------------------
  // 3d. Build the context value object
  // -------------------------------------------------------------------------
  const contextValue: AuthContextValue = {
    currentUser,
    idToken,
    loading,
    signInEmail,
    signUpEmail,
    signInGoogle,
    signOutUser,
    sendPasswordReset,
  };

  // While Firebase is still resolving the persisted session, render nothing.
  // This prevents a flash of the login page for already-authenticated users.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Initialising…</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// 4. Custom hook — use this in every component that needs auth data
//    Throws a clear error if used outside of <AuthProvider>
// ---------------------------------------------------------------------------
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error(
      "[useAuth] must be used inside <AuthProvider>. " +
        "Wrap your component tree with <AuthProvider> in main.tsx."
    );
  }
  return ctx;
}

// Named export so it can be imported as a type if needed elsewhere
export type { AuthContextValue };
