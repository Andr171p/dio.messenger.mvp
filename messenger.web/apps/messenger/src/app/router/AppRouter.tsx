import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { MessengerShellPage } from "../../pages/MessengerShellPage.js";
import { LoginPage } from "../../pages/LoginPage.js";
import { useAuth } from "../providers/AuthProvider.js";
import type { ReactNode } from "react";

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
                <MessengerShellPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthGate>
    </BrowserRouter>
  );
}
