// src/components/ProtectedRoute.tsx
// Full manual implementation of a route guard component.
// No template. No preset. No scaffold magic.
//
// Usage in router:
//   <Route element={<ProtectedRoute />}>
//     <Route path="/dashboard" element={<Dashboard />} />
//     <Route path="/transactions" element={<Transactions />} />
//   </Route>
//
// How it works:
//   1. Reads `currentUser` from AuthContext (set by Firebase onAuthStateChanged).
//   2. If the user IS authenticated → renders the child routes via <Outlet />.
//   3. If the user is NOT authenticated → redirects to /login, preserving the
//      originally requested URL in `state.from` so Login can redirect back.

import React, { useState, useEffect, useRef } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import api from "@/api";

// ---------------------------------------------------------------------------
// ProtectedRoute Component
// ---------------------------------------------------------------------------
// Props:
//   redirectTo – optional path to redirect unauthenticated users to (default: "/login")
// ---------------------------------------------------------------------------
interface ProtectedRouteProps {
  /** The path to navigate to when no user is signed in. Defaults to "/login". */
  redirectTo?: string;
}

export function ProtectedRoute({ redirectTo = "/login" }: ProtectedRouteProps) {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  // Three-state onboarding check:
  //   "checking" — we are asking the backend whether this user already has a profile
  //   true       — onboarding is done, show the app normally
  //   false      — new user (no backend profile + no local currency), show wizard
  //
  // Fast path: if localStorage already has a preferred currency the user has
  // set up before (on this device), skip the backend call entirely.
  const [onboardingState, setOnboardingState] = useState<"checking" | boolean>(
    () => (!!localStorage.getItem("preferredCurrency") ? true : "checking")
  );

  // Track the UID we last checked so we don't re-query on every render
  const checkedUid = useRef<string | null>(null);

  useEffect(() => {
    // Only run once per signed-in user, and only if the fast-path didn't already
    // resolve the state.
    if (onboardingState !== "checking") return;
    if (!currentUser) return;
    if (checkedUid.current === currentUser.uid) return;

    checkedUid.current = currentUser.uid;

    api
      .get("/users/profile")
      .then(() => {
        // Profile exists → returning user. Mark as done so they go straight to
        // the app. They can manage currency any time from Settings.
        setOnboardingState(true);
      })
      .catch((err) => {
        if (err?.response?.status === 404) {
          // Genuinely new user — no backend profile yet → show the wizard.
          setOnboardingState(false);
        } else {
          // Network error or server error — don't block the user; let them in.
          setOnboardingState(true);
        }
      });
  }, [currentUser, onboardingState]);

  // While Firebase resolves the persisted session, render a spinner instead of
  // redirecting — avoids a race condition where a valid session looks like "no user".
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Checking authentication…</p>
        </div>
      </div>
    );
  }

  // User is authenticated but email unverified — block access to private routes.
  // Skip this check for phone-only users who have no email address at all
  // (created via Firebase Custom Token / Phone.Email sign-in).
  if (currentUser !== null && currentUser.email && !currentUser.emailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  // User is authenticated and verified — render the nested <Route> children.
  // While we are still checking whether this user already has a backend profile,
  // show the same loading spinner to avoid a jarring flash of the wizard.
  if (currentUser !== null) {
    if (onboardingState === "checking") {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading your profile…</p>
          </div>
        </div>
      );
    }
    return (
      <>
        <Outlet />
        {onboardingState === false && (
          <OnboardingWizard onComplete={() => setOnboardingState(true)} />
        )}
      </>
    );
  }

  // User is NOT authenticated — redirect to the login page.
  // We store the current location in `state.from` so Login.tsx can
  // redirect back to the originally requested page after sign-in.
  return (
    <Navigate
      to={redirectTo}
      replace
      state={{ from: location }}
    />
  );
}

export default ProtectedRoute;
