import "@dio/messenger-ui/tokens.css";

document.documentElement.setAttribute("data-dio-theme", "light");
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppRouter } from "./app/router/AppRouter.js";
import { AuthProvider } from "./app/providers/AuthProvider.js";
import { QueryProvider } from "./app/providers/QueryProvider.js";
import { RuntimeProvider } from "./app/providers/RuntimeProvider.js";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <QueryProvider>
        <RuntimeProvider>
          <AppRouter />
        </RuntimeProvider>
      </QueryProvider>
    </AuthProvider>
  </StrictMode>,
);