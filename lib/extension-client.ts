const FROM_PAGE = "portfolio-chat"; // must match src/bridge.ts
const FROM_EXT = "portfolio-ext";
let seq = 0;

function request(
  type: string,
  extra: object = {},
  timeoutMs = 90_000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${++seq}`;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("extension_timeout"));
    }, timeoutMs);

    function onMessage(e: MessageEvent) {
      if (e.source !== window || e.origin !== location.origin) return;
      const m = e.data;
      if (!m || m.source !== FROM_EXT || m.id !== id) return;
      cleanup();
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
  async ping() {
    try {
      return await request("PING", {}, 1500);
    } catch {
      return null;
    }
  },
  async listTools(): Promise<any[]> {
    try {
      const r = await request("LIST_TOOLS", {}, 5000);
      return Array.isArray(r) ? r : [];
    } catch {
      return [];
    }
  },
  // 90s: an approval popup can wait up to 60s
  callTool: (name: string, args: unknown) =>
    request("CALL_TOOL", { name, args }),
};
