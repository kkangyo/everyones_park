export type ServerStatus = "connected" | "disconnected";

/** 서버 /health 를 한 번 확인한다. */
export async function checkHealth(timeoutMs = 2000): Promise<ServerStatus> {
  try {
    const res = await fetch("/health", { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return "disconnected";
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true ? "connected" : "disconnected";
  } catch {
    return "disconnected";
  }
}
