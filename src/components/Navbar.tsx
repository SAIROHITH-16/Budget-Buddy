import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "@/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

export function Navbar() {
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();

  // Listen to authentication state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  // Handle logout
  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <nav className="bg-white/80 backdrop-blur-xl border-b border-violet-100/60 shadow-sm sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-8 py-4 flex justify-between items-center">
        {/* Logo Section (Left) - Smart Routing */}
        <Link 
          to={user ? "/dashboard" : "/"} 
          className="flex items-center gap-2 hover:opacity-90 transition-opacity"
        >
          {/* Logo Mark */}
          <img 
            src="/logo.png" 
            alt="Budget Buddy Logo" 
            className="w-8 h-8 rounded object-contain"
          />
          {/* Logo Text */}
          <div className="flex flex-col justify-center">
            <span className="text-lg font-bold text-slate-800 leading-none">Budget Buddy</span>
            <span className="text-xs font-medium text-slate-400 mt-0.5">Personal Finance</span>
          </div>
        </Link>

        {/* Navigation Links & CTA (Right) - Auth-Aware */}
        <div className="flex items-center gap-6">
          {user ? (
            // Logged In State
            <>
              {/* About Link */}
              <Link
                to="/about"
                className="text-slate-600 hover:text-violet-600 transition-colors font-medium"
              >
                About
              </Link>

              {/* Dashboard Link */}
              <Link
                to="/dashboard"
                className="text-slate-600 hover:text-violet-600 transition-colors font-medium"
              >
                Dashboard
              </Link>

              {/* Log out Link */}
              <button
                onClick={handleLogout}
                className="text-slate-600 hover:text-rose-500 transition-colors font-medium"
              >
                Log out
              </button>
            </>
          ) : (
            // Logged Out State
            <>
              {/* About Link */}
              <Link
                to="/about"
                className="text-slate-600 hover:text-violet-600 transition-colors font-medium"
              >
                About
              </Link>

              {/* Log in Link */}
              <Link
                to="/login"
                className="text-slate-600 hover:text-violet-600 transition-colors font-medium"
              >
                Log in
              </Link>

              {/* Sign up CTA Button */}
              <Link
                to="/register"
                className="bg-violet-600 text-white px-4 py-2 rounded-md font-semibold hover:bg-violet-700 transition-colors shadow-lg shadow-violet-600/25"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
