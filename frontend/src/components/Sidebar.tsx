import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { navItems } from "../lib/navigation";
import { Button, Icon } from "./ui";

type Props = {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

export default function Sidebar({ collapsed, mobileOpen, onCloseMobile }: Props) {
  const location = useLocation();

  useEffect(() => {
    onCloseMobile();
  }, [location.pathname]);

  const sidebarClasses = [
    "app-sidebar",
    collapsed ? "is-collapsed" : "",
    mobileOpen ? "is-mobile-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div
        className={`app-backdrop ${mobileOpen ? "is-open" : ""}`.trim()}
        onClick={onCloseMobile}
        aria-hidden={!mobileOpen}
        role="presentation"
      />

      <aside
        className={sidebarClasses}
        aria-label="Navegacao principal"
        aria-modal={mobileOpen ? true : undefined}
        role={mobileOpen ? "dialog" : undefined}
        data-collapsed={collapsed ? "true" : "false"}
      >
        <div className="app-sidebar__chrome">
          <header className="app-sidebar__header">
            <div className="app-sidebar__top">
              <div className="app-sidebar__brand" aria-label="JQ" title="JQ">
                <div className="app-sidebar__logo">JQ</div>
              </div>

              <div className="app-sidebar__controls mobile-only">
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft="close"
                  onClick={onCloseMobile}
                  className="app-sidebar__close-btn mobile-only"
                  title="Fechar menu"
                  aria-label="Fechar menu"
                >
                  Fechar
                </Button>
              </div>
            </div>
          </header>

          <div className="app-sidebar__body">
            <nav className="app-sidebar__nav" aria-label="Menu">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    [
                      "app-sidebar__item",
                      isActive ? "is-active" : "",
                      collapsed ? "is-collapsed" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")
                  }
                  data-tooltip={item.label}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="app-sidebar__item-indicator" aria-hidden />
                  <span className="app-sidebar__item-icon" aria-hidden>
                    <Icon name={item.icon} size={18} />
                  </span>
                  <span className="app-sidebar__item-copy">
                    <span className="app-sidebar__item-text">{item.label}</span>
                  </span>
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </aside>
    </>
  );
}
