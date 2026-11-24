import "@dio/messenger-ui/tokens.css";

document.documentElement.setAttribute("data-dio-theme", "light");
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppRouter } from "./app/router/AppRouter.js";
import { AuthProvider } from "./app/providers/AuthProvider.js";
import { QueryProvider } from "./app/providers/QueryProvider.js";
import { RuntimeProvider } from "./app/providers/RuntimeProvider.js";
import { AppUpdateNotice } from "./app/AppUpdateNotice.js";
import { AppErrorBoundary } from "./app/AppErrorBoundary.js";
import { loadRuntimeConfig } from "./app/runtimeConfig.js";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

const app = createRoot(root);
void loadRuntimeConfig()
  .then(() =>
    app.render(
      <StrictMode>
        <AppErrorBoundary>
          <AuthProvider>
            <QueryProvider>
              <RuntimeProvider>
                <AppRouter />
                <AppUpdateNotice />
              </RuntimeProvider>
            </QueryProvider>
          </AuthProvider>
        </AppErrorBoundary>
      </StrictMode>,
    ),
  )
  .catch(() => {
    app.render(
      <main role="alert">
        <h1>DIO Chat недоступен</h1>
        <p>Не удалось загрузить настройки подключения.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Повторить
        </button>
      </main>,
    );
  });
