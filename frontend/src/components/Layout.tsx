import { UserMenu } from "../auth/UserMenu";
import { useAuth } from "../auth/context";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Blocks,
  FolderOpen,
  Layers3,
  CircleHelp,
  ArrowUpRight,
  House,
  PanelTop,
  ChevronDown,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { HeaderTargetContext } from "./headerTarget";
import type { Project } from "@habitat/domain";
export function Logo() {
  return (
    <Link to="/projects" className="brand">
      <span className="brand-symbol">
        <House size={21} strokeWidth={1.6} />
      </span>
      <span>
        habitat<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
export function Shell({
  children,
  project,
}: {
  children: ReactNode;
  project?: Project | null;
}) {
  const location = useLocation();
  const { user } = useAuth();
  const [headerTarget, setHeaderTarget] = useState<HTMLDivElement | null>(null);
  const base = project ? `/projects/${project.id}` : "/projects";
  return (
    <HeaderTargetContext.Provider value={headerTarget}>
      <div className="app-shell">
        <header className="global-header">
          <Logo />
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="slash">/</span>
            <FolderOpen size={14} />
            <Link to={base}>{project?.name ?? "Your projects"}</Link>
            <ChevronDown size={12} />
          </div>
          <div className="header-end" ref={setHeaderTarget} />
          <UserMenu />
        </header>
        <div className="shell-body">
          <aside className="global-rail">
            <NavLink
              to="/projects"
              end
              title="Projects"
              className={({ isActive }) =>
                isActive ? "rail-link active" : "rail-link"
              }
            >
              <FolderOpen size={20} />
            </NavLink>
            {project && (
              <>
                <NavLink
                  to={`${base}/editor`}
                  title="Home editor"
                  className={({ isActive }) =>
                    isActive ? "rail-link active" : "rail-link"
                  }
                >
                  <Layers3 size={20} />
                </NavLink>
                <NavLink
                  to={`${base}/review`}
                  title="Architectural review"
                  className={({ isActive }) =>
                    isActive ? "rail-link active" : "rail-link"
                  }
                >
                  <Blocks size={20} />
                </NavLink>
              </>
            )}
            {user?.role === "ADMIN" && (
              <NavLink
                to="/admin/users"
                title="Admin · Users"
                aria-label="Admin · Users"
                className={({ isActive }) =>
                  isActive ? "rail-link active" : "rail-link"
                }
              >
                <Users size={20} />
              </NavLink>
            )}
            {user?.role === "ADMIN" && (
              <NavLink
                to="/admin/items"
                title="Admin · Items"
                aria-label="Admin · Items"
                className={({ isActive }) =>
                  isActive ? "rail-link active" : "rail-link"
                }
              >
                <Blocks size={20} />
              </NavLink>
            )}
            <div className="rail-bottom">
              <Link
                className="rail-link"
                to={project ? `${base}` : "/projects"}
                title="Project overview"
              >
                <PanelTop size={19} />
              </Link>
              <a
                className="rail-link"
                href="/guide.html"
                target="_blank"
                title="Quick guide"
              >
                <CircleHelp size={20} />
              </a>
            </div>
          </aside>
          <main
            className={`main-content ${location.pathname.endsWith("/editor") ? "is-editor" : ""}`}
          >
            {children}
          </main>
        </div>
      </div>
    </HeaderTargetContext.Provider>
  );
}
export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-symbol">
        <House size={30} />
      </div>
      <h2>{title}</h2>
      <p>{detail}</p>
      {action}
    </div>
  );
}
export function ErrorState({ message }: { message: string }) {
  return (
    <div className="error-state" role="alert">
      <h2>Something needs attention</h2>
      <p>{message}</p>
      <button className="button" onClick={() => window.location.reload()}>
        Try again <ArrowUpRight size={16} />
      </button>
    </div>
  );
}
