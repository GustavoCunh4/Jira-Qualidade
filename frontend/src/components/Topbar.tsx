import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { getPageMeta } from "../lib/navigation";
import { dispatchGlobalSyncDone, dispatchIssuesSearch } from "../lib/uiEvents";
import { User } from "../lib/types";
import { Badge, Button, Icon } from "./ui";

export default function Topbar({
  user,
  onOpenMobileSidebar,
}: {
  user?: User | null;
  onOpenMobileSidebar: () => void;
}) {
  const location = useLocation();
  const meta = getPageMeta(location.pathname);
  const isIssuesPage = location.pathname === "/issues";
  const isDashboardPage = location.pathname === "/";

  const [profileOpen, setProfileOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [now, setNow] = useState(new Date());
  const profileRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!profileRef.current) return;
      if (!profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };

    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (location.pathname !== "/issues") return;
    const id = window.setTimeout(() => {
      dispatchIssuesSearch(searchValue);
    }, 220);
    return () => window.clearTimeout(id);
  }, [searchValue, location.pathname]);

  const roleLabel = useMemo(() => {
    if (user?.role === "admin") return "Administrador";
    if (user?.role === "manager") return "Gestor";
    return "Visualizador";
  }, [user?.role]);

  const syncLabel = useMemo(() => {
    if (collecting) return "Coletando";
    if (syncing) return "Sincronizando";
    return "Monitorando";
  }, [collecting, syncing]);

  const syncDetail = useMemo(() => {
    if (!lastSyncAt) return "sem sync manual";
    return lastSyncAt.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [lastSyncAt]);

  const handleLogout = async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  };

  const handleSync = async () => {
    if (syncing || collecting) return;
    setSyncing(true);
    try {
      await apiFetch("/jira/sync-now", { method: "POST" });
      setLastSyncAt(new Date());
      dispatchGlobalSyncDone();
    } catch {
      // Page-level screens show the detailed error.
    } finally {
      setSyncing(false);
    }
  };

  const handleForceCollect = async () => {
    if (syncing || collecting) return;
    setCollecting(true);
    try {
      await apiFetch("/dashboard/refresh", { method: "POST" });
      setLastSyncAt(new Date());
      dispatchGlobalSyncDone();
    } catch {
      // Page-level screens show the detailed error.
    } finally {
      setCollecting(false);
    }
  };

  return (
    <header
      className={[
        "app-topbar",
        isDashboardPage ? "app-topbar--dashboard" : "",
        !isIssuesPage ? "app-topbar--no-center" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="banner"
    >
      <div className="app-topbar__left">
        <Button
          variant="ghost"
          size="sm"
          iconLeft="menu"
          onClick={onOpenMobileSidebar}
          className="mobile-only app-topbar__menu-btn"
          aria-label="Abrir menu lateral"
        />

        <div className="app-topbar__title-wrap">
          {!isDashboardPage ? (
            <div className="app-topbar__eyebrow">
              <Badge variant="info">Workspace</Badge>
              <span className="app-topbar__page-path">{meta.label}</span>
            </div>
          ) : null}
          <div className="app-topbar__title">{meta.title}</div>
          {!isDashboardPage ? <div className="app-topbar__subtitle">{meta.subtitle}</div> : null}
        </div>
      </div>

      <div className="app-topbar__center">
        {isIssuesPage ? (
          <label className="top-search" role="search" aria-label="Busca de demandas">
            <Icon name="search" size={15} />
            <input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Buscar por titulo, chave, label ou responsavel"
              aria-label="Busca contextual em demandas"
            />
          </label>
        ) : null}
      </div>

      <div className="app-topbar__right">
        <div className="monitor-pill" title="Estado de sincronizacao da operacao">
          <span className="monitor-pill__dot" />
          <span>{syncLabel}</span>
          <span className="monitor-pill__muted">sync {syncDetail}</span>
        </div>

        <div className="app-topbar__action-group">
          <Button
            variant="secondary"
            size="sm"
            iconLeft="sync"
            onClick={handleSync}
            loading={syncing}
            disabled={collecting}
            className="desktop-only"
          >
            Sincronizar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconLeft="bolt"
            onClick={handleForceCollect}
            loading={collecting}
            disabled={syncing}
            className="desktop-only"
          >
            Rodar coleta
          </Button>
          <Button variant="ghost" size="sm" iconLeft="logout" onClick={handleLogout}>
            Sair
          </Button>
        </div>

        <div className="profile-menu" ref={profileRef}>
          <button
            type="button"
            className="profile-menu__trigger"
            onClick={() => setProfileOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            aria-label="Abrir menu de perfil"
          >
            <span className="profile-menu__avatar">
              <Icon name="user" size={14} />
            </span>
            <span className="profile-menu__meta">
              <strong>{user?.username || "Usuario"}</strong>
              <small>
                {roleLabel} | {now.toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </small>
            </span>
            <Icon
              name="chevron-right"
              size={14}
              className={`profile-menu__chevron ${profileOpen ? "is-open" : ""}`}
            />
          </button>

          {profileOpen ? (
            <div className="profile-menu__dropdown" role="menu">
              <button
                type="button"
                className="profile-menu__dropdown-item"
                onClick={handleSync}
                disabled={syncing || collecting}
                role="menuitem"
              >
                <Icon name="sync" size={14} />
                <span>Sincronizar agora</span>
              </button>
              <button
                type="button"
                className="profile-menu__dropdown-item"
                onClick={handleForceCollect}
                disabled={syncing || collecting}
                role="menuitem"
              >
                <Icon name="bolt" size={14} />
                <span>Rodar coleta</span>
              </button>
              <button
                type="button"
                className="profile-menu__dropdown-item is-danger"
                onClick={handleLogout}
                role="menuitem"
              >
                <Icon name="logout" size={14} />
                <span>Sair</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

