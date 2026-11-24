interface RuntimeConfig {
  messengerApi: string;
  deskApi: string;
  deskWeb: string;
  telemetry?: string;
}

const cacheKey = "dio-messenger:runtime-config";
let config: RuntimeConfig = {
  messengerApi: import.meta.env.VITE_MESSENGER_API_URL ?? "http://127.0.0.1:8002",
  deskApi: import.meta.env.VITE_DIODESK_API_URL ?? "http://localhost:8001",
  deskWeb: import.meta.env.VITE_DIODESK_WEB_URL ?? "http://localhost:3001",
};

function parseConfig(input: unknown): RuntimeConfig {
  if (!input || typeof input !== "object") throw new Error("Invalid configuration");
  const fields = input as Record<string, unknown>;
  function publicUrl(key: string) {
    const raw = fields[key];
    if (typeof raw !== "string") throw new Error("Missing service URL");
    const relative = /^\/(?![\\/])/.test(raw);
    const value = relative ? new URL(raw, window.location.origin) : new URL(raw);
    const safeRelative =
      relative &&
      value.origin === window.location.origin &&
      !value.pathname.startsWith("//") &&
      window.isSecureContext;
    const publicHTTPS =
      value.protocol === "https:" &&
      !["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(value.hostname);
    if (
      (!safeRelative && !publicHTTPS) ||
      value.username ||
      value.password ||
      value.search ||
      value.hash
    ) {
      throw new Error("Invalid service URL");
    }
    return (safeRelative ? value.pathname : value.href).replace(/\/$/, "");
  }
  return {
    messengerApi: publicUrl("messengerApi"),
    deskApi: publicUrl("deskApi"),
    deskWeb: publicUrl("deskWeb"),
    telemetry: fields.telemetry === undefined ? undefined : publicUrl("telemetry"),
  };
}

export async function loadRuntimeConfig(): Promise<void> {
  if (!import.meta.env.PROD || import.meta.env.VITE_RUNTIME_CONFIG !== "1") return;
  let response: Response;
  try {
    response = await fetch(`${import.meta.env.BASE_URL}messenger-runtime.json`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    const cached = localStorage.getItem(cacheKey);
    if (!cached) throw new Error("Configuration unavailable");
    config = parseConfig(JSON.parse(cached));
    return;
  }
  if (!response.ok) throw new Error("Configuration unavailable");
  config = parseConfig(await response.json());
  try {
    localStorage.setItem(cacheKey, JSON.stringify(config));
  } catch {
    // The current session can run even if the browser disallows persistence.
  }
}

export function getRuntimeConfig(): Readonly<RuntimeConfig> {
  return config;
}
