import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    return saved === "true";
  });

  useEffect(() => {
    const handleToggle = () => {
      const saved = localStorage.getItem("sidebarCollapsed");
      setCollapsed(saved === "true");
    };

    window.addEventListener("sidebarToggle", handleToggle);
    return () => window.removeEventListener("sidebarToggle", handleToggle);
  }, []);

  return (
    <div className="min-h-screen flex bg-transparent">
      <Sidebar />
      <main
        className={`flex-1 p-4 md:p-8 pt-16 md:pt-8 transition-all duration-300 ${
          collapsed ? "md:ml-20" : "md:ml-64"
        }`}
      >
        {children}
      </main>
    </div>
  );
}
