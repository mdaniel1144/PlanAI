import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Project, HomeScene } from "@habitat/domain";
import { client } from "./client";
export function useProject() {
  const { projectId } = useParams();
  const [project, setProject] = useState<Project | null>(null),
    [scene, setScene] = useState<HomeScene | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    Promise.all([client.project(projectId!), client.scene(projectId!)])
      .then(([p, s]) => {
        if (!cancelled) {
          setProject(p);
          setScene(s);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e.message));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  return { project, scene, setScene, loading, error };
}
