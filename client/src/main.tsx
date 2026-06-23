import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from "react-router-dom";
import { BookOpen, ClipboardCheck, GitBranch, BarChart2, Zap, Users, LogOut } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./lib/api.js";
import { AuthProvider, useAuth } from "./lib/auth.js";
import { WorkspaceProvider, useWorkspace } from "./lib/workspace.js";
import { CatalogPage } from "./pages/CatalogPage.js";
import { ReviewQueuePage } from "./pages/ReviewQueuePage.js";
import { IterationsPage } from "./pages/IterationsPage.js";
import { ProgressPage } from "./pages/ProgressPage.js";
import { EntitiesPage } from "./pages/EntitiesPage.js";
import { RuleDetailPage } from "./pages/RuleDetailPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import "./styles/global.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

const NAV_ITEMS = [
  { to: "/", label: "Catalog", icon: BookOpen, end: true },
  { to: "/review", label: "Review Queue", icon: ClipboardCheck },
  { to: "/iterations", label: "Iterations", icon: GitBranch },
  { to: "/entities", label: "Entities", icon: Users },
  { to: "/progress", label: "Progress", icon: BarChart2 },
];

function Sidebar() {
  const { data: progress } = useQuery({
    queryKey: ["progress"],
    queryFn: api.progress,
    refetchInterval: 15_000,
  });
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const reviewCount = progress?.totals.in_review ?? 0;

  function handleLogout() {
    logout();
    queryClient.clear();
    navigate("/login");
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Zap size={18} color="white" strokeWidth={2.5} />
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={label}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <Icon className="nav-item-icon" />
            {label === "Review Queue" && reviewCount > 0 && (
              <span className="nav-badge">{reviewCount}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <WorkspaceSwitcher />
        {user && (
          <div className="sidebar-user" title={`${user.name} (${user.role})`}>
            <span className="sidebar-user-name">{user.name}</span>
            <span className="sidebar-user-role">{user.role}</span>
          </div>
        )}
        <button
          className="nav-item"
          title="Logout"
          onClick={handleLogout}
          style={{ color: "var(--text-muted)" }}
        >
          <LogOut size={16} />
        </button>
        <div className="sidebar-mcp-status">
          <div className="status-dot" title="MCP server online" />
          <span className="mcp-label">MCP</span>
        </div>
      </div>
    </aside>
  );
}

/** Workspace switcher — sidebar footer. Read-only label when the user has one workspace. */
function WorkspaceSwitcher() {
  const { workspaces, activeWorkspaceId, setActiveWorkspace } = useWorkspace();
  if (workspaces.length === 0) return null;

  const active = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];

  if (workspaces.length === 1) {
    return (
      <div className="sidebar-ws sidebar-ws-single" title={`Workspace: ${active.name}`}>
        <span className="sidebar-ws-name">{active.name}</span>
      </div>
    );
  }

  return (
    <label className="sidebar-ws" title={`Workspace: ${active.name}`}>
      <span className="sidebar-ws-label">Workspace</span>
      <select
        className="sidebar-ws-select"
        value={active.id}
        onChange={(e) => setActiveWorkspace(e.target.value)}
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Renders children only when authenticated; redirects to /login otherwise. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AuthenticatedShell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<CatalogPage />} />
          <Route path="/review" element={<ReviewQueuePage />} />
          <Route path="/iterations" element={<IterationsPage />} />
          <Route path="/entities" element={<EntitiesPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/rule/:id" element={<RuleDetailPage />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <AuthenticatedShell />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WorkspaceProvider>
          <App />
        </WorkspaceProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
