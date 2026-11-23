import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { MessengerShellPage } from "../../pages/MessengerShellPage.js";
import { LoginPage } from "../../pages/LoginPage.js";
import { useAuth } from "../providers/AuthProvider.js";
import type { ReactNode } from "react";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export function AppRouter() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}