import type { components } from "@dio/messenger-core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useRuntime } from "../app/providers/RuntimeProvider.js";

export function requiresMediaProxy(url: URL): boolean {
  return (
    url.protocol === "http:" &&
    (window.location.protocol === "https:" ||
      (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
        url.hostname !== window.location.hostname))
  );
}

export function useMediaSource(
  assetId: string,
  mode: "visual" | "all" | "metadata" = "metadata",
) {
  const { http } = useRuntime();
  const metadata = useQuery({
    queryKey: ["media-metadata", assetId],
    enabled: !!http,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "uploaded" || status === "scanning" ? 3_000 : false;
    },
    queryFn: () =>
      http!.get<components["schemas"]["MediaAssetDTO"]>("/v1/media/" + assetId),
  });
  const asset = metadata.data;
  const contentType = asset?.contentType;
  const image = contentType?.startsWith("image/");
  const loadSource =
    mode === "all" ||
    (mode === "visual" && (image || contentType?.startsWith("video/")));
  const access = useQuery({
    queryKey: ["media-access", assetId],
    enabled: !!http && !!loadSource && asset?.status === "ready",
    staleTime: (query) => {
      const expiration = query.state.data?.expiresAt;
      return expiration
        ? Math.max(0, Date.parse(expiration) - query.state.dataUpdatedAt - 5_000)
        : 0;
    },
    queryFn: () =>
      http!.post<components["schemas"]["MediaAccessDTO"]>(
        "/v1/media/" + assetId + "/access",
        { role: "original" },
      ),
  });
  const signed = access.data?.url;
  const url = signed && URL.canParse(signed) ? new URL(signed) : null;
  const proxy = !!url && requiresMediaProxy(url);
  const [binary, setBinary] = useState<{ assetId: string; source?: string }>();
  const shouldRead = !!http && proxy && (mode === "all" || (mode === "visual" && !!image));
  useEffect(() => {
    if (!http || !shouldRead) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void http
      .request<Blob>("/v1/media/" + assetId + "/content", {
        responseType: "blob",
        timeoutMs: 90_000,
        signal: controller.signal,
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setBinary({ assetId, source: objectUrl });
      })
      .catch(() => {
        if (!controller.signal.aborted) setBinary({ assetId });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, http, shouldRead]);
  const resolved = binary?.assetId === assetId ? binary : undefined;
  return {
    metadata,
    source: proxy ? resolved?.source : url?.href,
    sourceError: access.isError || (proxy && !!resolved && !resolved.source),
  };
}
