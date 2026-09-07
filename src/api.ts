import type { Msg, Snapshot } from "./mutations";

async function j<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((body as { error?: string } | null)?.error ?? `HTTP ${res.status}`);
  }
  // 2xx but no JSON body (e.g. plain `vite` dev serving a transpiled module for
  // /api/*): treat as a failed fetch so the offline seed fallback kicks in.
  if (body === null) throw new Error(`HTTP ${res.status}`);
  return body as T;
}

export async function fetchState(): Promise<Snapshot> {
  return j<Snapshot>(await fetch("/api/state"));
}

export async function mutate(
  msg: Msg,
  owner: string,
): Promise<{ snapshot: Snapshot; result: Record<string, unknown> }> {
  const body = await j<Snapshot & { result: Record<string, unknown> }>(
    await fetch("/api/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...msg, owner }),
    }),
  );
  const { result, ...snapshot } = body;
  return { snapshot, result };
}
