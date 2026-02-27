import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { apiFetch } from "./lib/api";
import { User } from "./lib/types";
import Login from "./pages/Login";
import { SkeletonCard } from "./components/ui";
import AppShell from "./components/layout/AppShell";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      try {
        const data = await apiFetch<User>("/auth/me");
        if (mounted) setUser(data);
      } catch {
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadUser();

    return () => {
      mounted = false;
    };
  }, []);

  const loadingShell = useMemo(
    () => (
      <div className="app-loading">
        <div className="app-loading__panel">
          <div className="app-loading__header">
            <div className="app-sidebar__logo">JQ</div>
            <div>
              <div className="app-loading__title">Jira Qualidade - IPQ</div>
              <div className="app-loading__subtitle">Preparando workspace...</div>
            </div>
          </div>
          <div className="app-loading__grid">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    ),
    []
  );

  if (loading) return loadingShell;

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <Login onLogin={setUser} />}
      />
      <Route
        path="/*"
        element={user ? <AppShell user={user} /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}
