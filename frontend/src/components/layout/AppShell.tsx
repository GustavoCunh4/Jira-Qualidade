import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "../Sidebar";
import Header from "../Header";
import { User } from "../../lib/types";
import Dashboard from "../../pages/Dashboard";
import People from "../../pages/People";
import Settings from "../../pages/Settings";

const MOBILE_BREAKPOINT = 980;

export default function AppShell({ user }: { user: User | null }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= MOBILE_BREAKPOINT;
  });
  const sidebarCollapsed = !isMobileViewport;

  useEffect(() => {
    const onResize = () => {
      setIsMobileViewport(window.innerWidth <= MOBILE_BREAKPOINT);
      if (window.innerWidth > MOBILE_BREAKPOINT) {
        setMobileSidebarOpen(false);
      }
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!mobileSidebarOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (window.innerWidth > MOBILE_BREAKPOINT) return;

    const previousOverflow = document.body.style.overflow;
    if (mobileSidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = previousOverflow || "";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    document.body.classList.add("dashboard-tv-mode");
    return () => document.body.classList.remove("dashboard-tv-mode");
  }, []);

  return (
    <div
      className={[
        "app-shell",
        sidebarCollapsed ? "is-sidebar-collapsed" : "",
        mobileSidebarOpen ? "is-sidebar-mobile-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
      data-sidebar-mobile-open={mobileSidebarOpen ? "true" : "false"}
    >
      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <main className="app-main" id="app-main-content">
        <div className="app-main__stage">
          <Header user={user} onOpenMobileSidebar={() => setMobileSidebarOpen(true)} />

          <div className="app-main__page">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/issues" element={<Navigate to="/" replace />} />
              <Route path="/board-control" element={<Navigate to="/" replace />} />
              <Route path="/people" element={<People />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
        </div>
      </main>
    </div>
  );
}


