import { Component, type ReactNode } from "react";
import { reportFailure } from "./telemetry.js";

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    reportFailure("render_failed");
  }

  override render() {
    if (this.state.failed) {
      return (
        <main role="alert">
          <h1>Не удалось открыть DIO Chat</h1>
          <button type="button" onClick={() => window.location.reload()}>
            Перезагрузить
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
