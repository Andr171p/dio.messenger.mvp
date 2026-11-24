import { useEffect, useState } from "react";
import { Button } from "@dio/messenger-ui";
import styles from "./AppUpdateNotice.module.css";
import { reportFailure } from "./telemetry.js";

let registration: Promise<ServiceWorkerRegistration> | undefined;

export function AppUpdateNotice() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [failed, setFailed] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let active = true;
    let cleanup = () => {};
    registration ??= navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`,
      {
        updateViaCache: "none",
      },
    );
    void registration
      .then((worker) => {
        if (!active) return;
        const check = () => {
          if (active && navigator.serviceWorker.controller) setWaiting(worker.waiting);
        };
        const followInstall = () =>
          worker.installing?.addEventListener("statechange", check);
        const update = () => {
          void worker.update().catch(() => undefined);
        };
        check();
        followInstall();
        worker.addEventListener("updatefound", followInstall);
        window.addEventListener("online", update);
        cleanup = () => {
          worker.removeEventListener("updatefound", followInstall);
          window.removeEventListener("online", update);
        };
      })
      .catch(() => reportFailure("app_update_failed"));
    return () => {
      active = false;
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (!applying) return;
    const reload = () => window.location.reload();
    navigator.serviceWorker.addEventListener("controllerchange", reload, {
      once: true,
    });
    const timeout = setTimeout(() => {
      reportFailure("app_update_failed");
      setApplying(false);
      setFailed(true);
    }, 15_000);
    waiting?.postMessage({ type: "SKIP_WAITING" });
    return () => {
      clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener("controllerchange", reload);
    };
  }, [applying, waiting]);

  if (!waiting) return null;
  return (
    <section className={styles.notice} aria-label="Обновление приложения">
      <span role="status">
        {failed ? "Не удалось обновить приложение" : "Доступна новая версия DIO Chat"}
      </span>
      <Button
        size="sm"
        disabled={applying}
        onClick={() => {
          setFailed(false);
          setApplying(true);
        }}
      >
        {failed ? "Повторить" : "Обновить"}
      </Button>
    </section>
  );
}
