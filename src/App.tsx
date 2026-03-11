// src/App.tsx
// Full manual implementation of the root application component.
// No template. No scaffold. No hidden framework magic.
//
// Route structure:
//   Public routes (accessible without authentication):
//     /login     → Login page
//     /register  → Register page
//
//   Protected routes (require Firebase authentication via ProtectedRoute):
//     /              → Dashboard
//     /transactions  → Transactions page
//     /insights      → Insights page
//
//   Catch-all:
//     *          → NotFound page
//
// Auth flow:
//   1. <AuthProvider> wraps the entire tree — resolves the Firebase session once.
//   2. <ProtectedRoute> acts as a guard for all private routes.
//      - If signed in  → renders child routes via <Outlet />.
//      - If signed out → redirects to /login, preserving the intended URL.

import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

// Auth context provider — must wrap everything that needs auth state
import { AuthProvider } from "@/context/AuthContext";

// Route guard — wraps all routes that require authentication
import { ProtectedRoute } from "@/components/ProtectedRoute";

// Shown by <Suspense> while a lazy page chunk is downloading
import { PageLoader } from "@/components/PageLoader";

// ---------------------------------------------------------------------------
// Lazy page imports — each page is split into its own JS chunk.
// The browser only downloads a page's chunk the first time the user visits
// that route, making the initial load faster and subsequent navigations instant.
// ---------------------------------------------------------------------------

// Public pages
const Landing       = lazy(() => import("@/pages/Landing"));
const Login         = lazy(() => import("@/pages/Login"));
const Register      = lazy(() => import("@/pages/Register"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const About         = lazy(() => import("@/pages/About"));
const VerifyEmail   = lazy(() => import("@/pages/VerifyEmail"));
const PhoneSignIn   = lazy(() => import("@/pages/PhoneSignIn"));

// Private pages
const Dashboard     = lazy(() => import("@/pages/Dashboard"));
const Transactions  = lazy(() => import("@/pages/Transactions"));
const Insights      = lazy(() => import("@/pages/Insights"));
const Settings      = lazy(() => import("@/pages/Settings"));
const ReviewQueue   = lazy(() => import("@/pages/ReviewQueue"));

// Utility pages
const NotFound      = lazy(() => import("@/pages/NotFound"));

// ---------------------------------------------------------------------------
// React Query client — plain instantiation, no custom options needed
// ---------------------------------------------------------------------------
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry failed queries automatically (auth failures should surface immediately)
      retry: 1,
      // Consider data stale after 30 seconds
      staleTime: 30_000,
    },
  },
});

// ---------------------------------------------------------------------------
// Root App component
// ---------------------------------------------------------------------------
function App() {
  return (
    // QueryClientProvider enables React Query for the whole app
    <QueryClientProvider client={queryClient}>
      {/* TooltipProvider enables Radix Tooltip context globally */}
      <TooltipProvider>
        {/* Toast notification sinks — kept outside AuthProvider intentionally */}
        <Toaster />
        <Sonner />

        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          {/*
            AuthProvider must be inside BrowserRouter so that it can access
            the router context (e.g., for redirect-after-login navigation).
          */}
          <AuthProvider>
            {/* Suspense boundary — shows PageLoader spinner while any lazy
                page chunk is being fetched over the network.             */}
            <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* ----------------------------------------------------------
                  Public routes — anyone can reach these pages
              ---------------------------------------------------------- */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/phone-signin" element={<PhoneSignIn />} />
              <Route path="/about" element={<About />} />

              {/* ----------------------------------------------------------
                  Protected routes — ProtectedRoute is the layout wrapper.
                  All child <Route> elements inside it require a signed-in user.
                  If not signed in, the user is redirected to /login by ProtectedRoute.
              ---------------------------------------------------------- */}
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/review" element={<ReviewQueue />} />
                <Route path="/settings" element={<Settings />} />
              </Route>

              {/* ----------------------------------------------------------
                  Catch-all — 404 page
              ---------------------------------------------------------- */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
