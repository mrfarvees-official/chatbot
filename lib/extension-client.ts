const FROM_PAGE = "portfolio-chat"; // must match src/bridge.ts
const FROM_EXT = "portfolio-ext";
const DEBUG = process.env.NEXT_PUBLIC_EXTENSION_DEBUG_LOGGING === "true";
let seq = 0;

function debug(event: string, details?: Record<string, unknown>) {
  if (DEBUG) console.debug(`[extension] ${event}`, details ?? {});
}

function request<T>(
  type: string,
  extra: object = {},
  timeoutMs = 90_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${++seq}`;
    const started = performance.now();
    debug("request:start", { id, type, timeoutMs });
    const timer = setTimeout(() => {
      cleanup();
      debug("request:timeout", {
        id,
        type,
        elapsedMs: Math.round(performance.now() - started),
      });
      reject(new Error("extension_timeout"));
    }, timeoutMs);

    function onMessage(e: MessageEvent) {
      if (e.source !== window || e.origin !== location.origin) return;
      const m = e.data;
      if (!m || m.source !== FROM_EXT || m.id !== id) return;
      cleanup();
      debug("request:response", {
        id,
        type,
        elapsedMs: Math.round(performance.now() - started),
      });
      resolve(m.reply);
    }
    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    }

    window.addEventListener("message", onMessage);
    window.postMessage(
      { source: FROM_PAGE, id, type, ...extra },
      location.origin,
    );
  });
}

export const extension = {
  async ping(): Promise<{ ok?: boolean; version?: string } | null> {
    try {
      return await request<{ ok?: boolean; version?: string }>("PING", {}, 1500);
    } catch {
      return null;
    }
  },
  async listTools(): Promise<unknown[]> {
    try {
      const r = await request<unknown>("LIST_TOOLS", {}, 5000);
      return Array.isArray(r) ? r : [];
    } catch {
      return [];
    }
  },
  // 90s: an approval popup can wait up to 60s
  callTool: (name: string, args: unknown): Promise<unknown> =>
    request<unknown>("CALL_TOOL", { name, args }),
};
