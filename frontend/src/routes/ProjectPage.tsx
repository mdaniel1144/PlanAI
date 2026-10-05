import { StartScene } from "../features/editor/StartScene";
import { Link, useParams } from "react-router-dom";
import { LoaderCircle, PencilRuler } from "lucide-react";
import { useProject } from "../api/useProject";
import { Shell, ErrorState, EmptyState } from "../components/Layout";
import { Editor } from "../features/editor/Editor";
import { Overview } from "../pages/Overview";
import { ReviewPage } from "../pages/ReviewPage";
import { ExportPage } from "../pages/ExportPage";
export function ProjectPage({
  page,
}: {
  page: "overview" | "editor" | "review" | "export" | "analysis";
}) {
  const { projectId } = useParams();
  return <ProjectContent key={projectId} page={page} />;
}
function ProjectContent({
  page,
}: {
  page: "overview" | "editor" | "review" | "export" | "analysis";
}) {
  const data = useProject();
  return (
    <Shell project={data.project}>
      {data.loading ? (
        <div className="loading-state">
          <LoaderCircle className="spin" size={22} /> Loading your workspace…
        </div>
      ) : data.error ? (
        <ErrorState message={data.error} />
      ) : data.project ? (
        <>
          {page === "overview" ? (
            <Overview project={data.project} scene={data.scene} />
          ) : !data.scene && page === "editor" ? (
            <StartScene projectId={data.project.id} onScene={data.setScene} />
          ) : !data.scene ? (
            <EmptyState
              title="Your home starts with a plan"
              detail="Open the editor to create a floor and draw your home."
              action={
                <Link
                  className="button primary"
                  to={`/projects/${data.project.id}/editor`}
                >
                  <PencilRuler size={16} /> Open editor
                </Link>
              }
            />
          ) : page === "editor" ? (
            <Editor
              project={data.project}
              scene={data.scene}
              onScene={data.setScene}
            />
          ) : page === "review" ? (
            <ReviewPage project={data.project} scene={data.scene} />
          ) : (
            <ExportPage scene={data.scene} />
          )}
        </>
      ) : null}
    </Shell>
  );
}
