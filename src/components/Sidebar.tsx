import { useState, useEffect } from "react";
import { NavLink, Link } from "react-router-dom";
import { LayoutDashboard, ArrowLeftRight, Menu, X, Brain, LogOut, Settings, ClipboardCheck, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { usePendingTransactions } from "@/hooks/usePendingTransactions";

const navItems = [
  { title: "Dashboard",    path: "/dashboard",    icon: LayoutDashboard },
  { title: "Transactions", path: "/transactions", icon: ArrowLeftRight },
  { title: "Insights",     path: "/insights",     icon: Brain },
  { title: "Review",       path: "/review",       icon: ClipboardCheck },
  { title: "About",        path: "/about",        icon: Info },
  { title: "Settings",     path: "/settings",     icon: Settings },
];

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    return saved === "true";
  });
  const { currentUser, signOutUser } = useAuth();
  const { data: pendingTxns } = usePendingTransactions();
  const pendingCount = pendingTxns?.length ?? 0;

  // Persist collapsed state
  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", String(collapsed));
    window.dispatchEvent(new Event("sidebarToggle"));
  }, [collapsed]);

  async function handleSignOut() {
    try {
      await signOutUser();
      // AuthProvider's onAuthStateChanged listener clears the session.
      // ProtectedRoute will then redirect to /login automatically.
    } catch (err) {
      console.error("[Sidebar] Sign-out failed:", err);
    }
  }

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-white/90 backdrop-blur-sm border border-violet-200/60 text-violet-600 shadow-md md:hidden"
        aria-label="Toggle sidebar"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 h-full bg-white/90 backdrop-blur-2xl border-r border-violet-100/70 shadow-xl flex flex-col transition-all duration-300 md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "md:w-20" : "md:w-64"} w-64`}
      >
        {/* Header */}
        <div className={`px-6 py-6 border-b border-violet-100/70 transition-all duration-300 ${collapsed ? "md:px-4" : ""}`}>
          <Link 
            to="/" 
            className={`flex items-center gap-3 hover:opacity-80 transition-opacity duration-200 ${collapsed ? "md:justify-center" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(139,92,246,0.12))', border: '1px solid rgba(124,58,237,0.28)' }}>
              <img 
                src="/logo.png" 
                alt="Budget Buddy Logo" 
                className="h-6 w-6 object-contain"
              />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="text-lg font-bold tracking-tight truncate text-slate-800 transition-colors duration-200 ease-in-out hover:text-violet-600">Budget Buddy</h1>
                <p className="text-xs text-slate-400 truncate">Personal Finance</p>
              </div>
            )}
          </Link>
        </div>

        {/* Desktop collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex absolute -right-3 top-20 z-50 h-6 w-6 items-center justify-center rounded-full bg-white border border-violet-200 text-violet-600 hover:bg-violet-600 hover:text-white shadow-md transition-all duration-150 hover:scale-110"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{ boxShadow: "0 2px 10px rgba(124,58,237,0.25)" }}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              end={item.path === "/"}
              title={collapsed ? item.title : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150 relative group ${
                  collapsed ? "md:justify-center md:px-3 px-4" : "px-4"
                } py-3 ${
                  isActive
                    ? "bg-violet-50 text-violet-700 font-semibold border-l-2 border-violet-500 pl-[14px]"
                    : "text-slate-600 hover:text-violet-700 hover:bg-violet-50/60"
                }`
              }
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="truncate">{item.title}</span>
                  {item.path === "/review" && pendingCount > 0 && (
                    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400/20 px-1.5 text-[10px] font-bold text-amber-600">
                      {pendingCount > 99 ? "99+" : pendingCount}
                    </span>
                  )}
                </>
              )}
              {collapsed && item.path === "/review" && pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              )}
              {/* Tooltip for collapsed state */}
              {collapsed && (
                <span className="hidden md:block absolute left-full ml-2 px-2 py-1 bg-white text-slate-700 text-xs rounded-lg shadow-lg border border-violet-100 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity duration-150 sidebar-tooltip z-50">
                  {item.title}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User info + sign-out */}
        <div className={`px-4 py-4 border-t border-violet-100/70 space-y-3 ${collapsed ? "md:px-2" : ""}`}>
          {currentUser && !collapsed && (
            <div className="flex items-center gap-2 px-1">
              {/* Avatar circle with first initial */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
                {(currentUser.email?.[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-800">
                  {currentUser.displayName ?? "Signed in"}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {currentUser.email}
                </p>
              </div>
            </div>
          )}

          {currentUser && collapsed && (
            <div className="hidden md:flex justify-center">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
                {(currentUser.email?.[0] ?? "?").toUpperCase()}
              </div>
            </div>
          )}

          <button
            onClick={handleSignOut}
            title={collapsed ? "Sign out" : undefined}
            className={`flex w-full items-center gap-3 rounded-lg py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 group relative ${
              collapsed ? "md:justify-center md:px-2 px-4" : "px-4"
            }`}
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span>Sign out</span>}
            {/* Tooltip for collapsed state */}
            {collapsed && (
              <span className="hidden md:block absolute left-full ml-2 px-2 py-1 bg-white text-slate-700 text-xs rounded-lg shadow-lg border border-violet-100 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity duration-150 sidebar-tooltip z-50">
                Sign out
              </span>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
