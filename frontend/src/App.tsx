import {
  createBrowserRouter,
  createRoutesFromElements,
  RouterProvider,
  Route,
  Navigate,
  Link,
} from "react-router-dom";
import { Shell, EmptyState } from "./components/Layout";
import { AdminItems, AdminItemEditor } from "./features/items/AdminItems";
import { AuthProvider } from "./auth/AuthProvider";
import { ProtectedRoute, AdminRoute } from "./auth/RouteGuards";
import { LoginPage } from "./auth/LoginPage";
import { DisplayPage } from "./auth/DisplayPage";
import { AccountPage } from "./auth/AccountPage";
import { AdminUsersPage } from "./auth/AdminUsersPage";
import { ProjectPage } from "./routes/ProjectPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { NewProject } from "./pages/NewProject";
import "./styles/App.css";
const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/settings/display" element={<DisplayPage />} />
        <Route path="/settings/account" element={<AccountPage />} />
        <Route element={<AdminRoute />}>
          <Route path="/admin/items" element={<AdminItems />} />
          <Route path="/admin/items/:itemId" element={<AdminItemEditor />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
        </Route>
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/new" element={<NewProject />} />
        <Route
          path="/projects/:projectId"
          element={<ProjectPage page="overview" />}
        />
        <Route
          path="/projects/:projectId/review"
          element={<ProjectPage page="review" />}
        />
        <Route
          path="/projects/:projectId/editor"
          element={<ProjectPage page="editor" />}
        />
        <Route
          path="/projects/:projectId/export"
          element={<ProjectPage page="export" />}
        />
        <Route
          path="*"
          element={
            <Shell>
              <EmptyState
                title="This page isn't here"
                detail="Return to your workspace to continue."
                action={
                  <Link className="button" to="/projects">
                    View projects
                  </Link>
                }
              />
            </Shell>
          }
        />
      </Route>
    </>,
  ),
);
export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
