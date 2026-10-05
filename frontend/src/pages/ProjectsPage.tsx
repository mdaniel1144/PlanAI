import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, House, ArrowUpRight, ShieldCheck } from "lucide-react";
import { client } from "../api/client";
import { Shell, ErrorState } from "../components/Layout";
import { PageHeading } from "../components/PageHeading";
import type { Project } from "@habitat/domain";

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    client
      .projects()
      .then(setProjects)
      .catch((e) => setError(String(e.message)))
      .finally(() => setLoading(false));
  }, []);
  return (
    <Shell>
      <div className="page-content">
        <PageHeading
          eyebrow="Your workspace"
          title="A place for every home."
          description="Turn residential plans into connected, editable architecture."
          action={
            <Link className="button primary" to="/projects/new">
              <Plus size={16} /> New project
            </Link>
          }
        />
        <div className="projects-toolbar">
          <h3>
            All projects <span className="count-badge">{projects.length}</span>
          </h3>
          <div className="search-field">
            <Search size={15} />
            <input
              placeholder="Search projects..."
              aria-label="Search projects"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        {error ? (
          <ErrorState message={error} />
        ) : loading ? (
          <div className="loading-state">Loading projects…</div>
        ) : (
          <div className="project-grid">
            {projects
              .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
              .map((p) => (
                <Link
                  key={p.id}
                  to={`/projects/${p.id}${p.isDemo ? "/editor" : ""}`}
                  className="project-card"
                >
                  <div
                    className={`project-card-visual ${p.isDemo ? "demo" : ""}`}
                  >
                    <House size={64} strokeWidth={0.7} />
                    <span className="tag">
                      {p.isDemo ? "Example home" : "New project"}
                    </span>
                    <span className="card-visual-label">
                      {p.isDemo
                        ? "RESIDENTIAL · GROUND FLOOR"
                        : "YOUR NEXT SPACE"}
                    </span>
                  </div>
                  <div className="project-card-info">
                    <div>
                      <h3>{p.name}</h3>
                      <p>
                        {p.isDemo
                          ? "7 rooms · 134 m² · Authored fixture"
                          : "Residential · Ready for your plans"}
                      </p>
                    </div>
                    <ArrowUpRight size={20} />
                  </div>
                </Link>
              ))}
            <Link to="/projects/new" className="new-project-card">
              <Plus size={26} />
              <h3>Create a new home</h3>
              <p>Every detail starts with a plan.</p>
            </Link>
          </div>
        )}
        <div className="workspace-note">
          <ShieldCheck size={18} />
          <div>
            <strong>Architecture you can account for.</strong>
            <p>One canonical home. Shared geometry. Every change preserved.</p>
          </div>
        </div>
      </div>
    </Shell>
  );
}
