import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "../../pages/LoginPage.js";
import { useAuth } from "../providers/AuthProvider.js";
import { lazy, Suspense, type ReactNode } from "react";

const MessengerShellPage = lazy(async () => {
  const { MessengerShellPage } = await import("../../pages/MessengerShellPage.js");
  return { default: MessengerShellPage };
});

function AuthGate({ children }: { children: ReactNode }) {
  const { ready } = useAuth();
  if (!ready) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          color: "var(--dio-text-secondary)",
        }}
      >
        Восстановление сессии…
      </div>
    );
  }
  return children;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, ready } = useAuth();
  if (!ready) return null;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AuthGate>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Suspense fallback={<p role="status">Загрузка переписки…</p>}>
                  <MessengerShellPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthGate>
    </BrowserRouter>
  );
}
