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
  await writeSnapshot(c, current, res.snapshot);
  return res;
}
