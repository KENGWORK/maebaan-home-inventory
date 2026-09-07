import { applyMutation, type Msg, type Snapshot } from "../src/mutations";
import { readState, writeSnapshot, type SheetsClient } from "./_sheets";

export async function runMutation(
  c: SheetsClient,
  msg: Msg,
  owner: string,
): Promise<{ snapshot: Snapshot; result: Record<string, unknown> } | { error: string }> {
  const current = await readState(c);
  const res = applyMutation(current, msg, owner);
  if ("error" in res) return res;
  // Reducers unshift new audit rows onto the FRONT of history (newest-first),
  // so the delta is the head of the array; the sheet wants chronological ascending.
  const delta = res.snapshot.history.length - current.history.length;
  const newRows = delta > 0 ? res.snapshot.history.slice(0, delta) : [];
  await writeSnapshot(c, res.snapshot, [...newRows].reverse());
  return res;
}
