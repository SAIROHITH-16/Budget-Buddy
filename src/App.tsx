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

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

// Auth context provider — must wrap everything that needs auth state
import { AuthProvider } from "@/context/AuthContext";

// Route guard — wraps all routes that require authentication
import { ProtectedRoute } from "@/components/ProtectedRoute";

// Public pages — accessible without logging in
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import About from "@/pages/About";

// Private pages — only accessible when authenticated
import Dashboard from "@/pages/Dashboard";
import Transactions from "@/pages/Transactions";
import Insights from "@/pages/Insights";
import Settings from "@/pages/Settings";
import ReviewQueue from "@/pages/ReviewQueue";

// Utility pages
import NotFound from "@/pages/NotFound";

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
            <Routes>
              {/* ----------------------------------------------------------
                  Public routes — anyone can reach these pages
              ---------------------------------------------------------- */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
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
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
