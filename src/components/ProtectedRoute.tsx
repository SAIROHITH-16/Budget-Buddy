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

import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

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
  // Google OAuth users always have emailVerified === true, so this only gates
  // email+password accounts that haven't clicked their verification link yet.
  if (currentUser !== null && !currentUser.emailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  // User is authenticated and verified — render the nested <Route> children
  if (currentUser !== null) {
    return <Outlet />;
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
