// src/firebase.ts
// Full explicit Firebase client-side configuration.
// No template, no boilerplate — every line is hand-written.
// Reads credentials from Vite environment variables (.env file).

import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  type Auth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  RecaptchaVerifier,
  linkWithPhoneNumber,
  PhoneAuthProvider,
  type User,
  type UserCredential,
  type ConfirmationResult,
} from "firebase/auth";

// ---------------------------------------------------------------------------
// 1. Firebase project configuration
//    All values come from your Firebase console → Project settings → Your apps
//    and are injected at build time via Vite's VITE_ prefix convention.
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};

// ---------------------------------------------------------------------------
// 2. Initialize the Firebase app (only once — Firebase handles duplication)
// ---------------------------------------------------------------------------
const app: FirebaseApp = initializeApp(firebaseConfig);

// ---------------------------------------------------------------------------
// 3. Get the Auth service bound to this app instance
// ---------------------------------------------------------------------------
const auth: Auth = getAuth(app);

// ---------------------------------------------------------------------------
// 4. Pre-configured Google provider — add scopes if needed
// ---------------------------------------------------------------------------
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// ---------------------------------------------------------------------------
// 5. Explicit auth helper functions — no magic wrappers
// ---------------------------------------------------------------------------

/**
 * Sign a user in with email + password.
 * Returns the full Firebase UserCredential on success.
 * Throws a FirebaseError on failure (caller must catch).
 */
async function loginWithEmail(
  email: string,
  password: string
): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Create a new account with email + password.
 * Returns the full Firebase UserCredential on success.
 * Throws a FirebaseError on failure (caller must catch).
 */
async function registerWithEmail(
  email: string,
  password: string
): Promise<UserCredential> {
  return createUserWithEmailAndPassword(auth, email, password);
}

/**
 * Trigger Firebase Google sign-in popup.
 * Returns the full Firebase UserCredential on success.
 * Throws a FirebaseError on failure (caller must catch).
 */
async function loginWithGoogle(): Promise<UserCredential> {
  return signInWithPopup(auth, googleProvider);
}

/**
 * Sign the currently authenticated user out.
 * Clears the local Firebase session immediately.
 */
async function logout(): Promise<void> {
  return signOut(auth);
}

/**
 * Send a password reset email to the given email address.
 * Firebase will send an email with a link to reset the password.
 * Throws a FirebaseError on failure (caller must catch).
 */
async function resetPassword(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}

/**
 * Subscribe to Firebase auth state changes.
 * @param callback - Called with the User object when signed in, or null when signed out.
 * @returns Unsubscribe function — call it to stop listening.
 */
function subscribeToAuthChanges(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

// ---------------------------------------------------------------------------
// 6. Exports — explicit named exports, nothing hidden
// ---------------------------------------------------------------------------
export {
  app,
  auth,
  googleProvider,
  loginWithEmail,
  registerWithEmail,
  loginWithGoogle,
  logout,
  resetPassword,
  subscribeToAuthChanges,
  updateProfile,
  RecaptchaVerifier,
  linkWithPhoneNumber,
  PhoneAuthProvider,
};

export type { User, UserCredential, ConfirmationResult };
