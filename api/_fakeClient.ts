// api/_fakeClient.ts — in-memory SheetsClient for tests
import type { SheetsClient } from "./_sheets.js";

export function fakeClient(
  initial: Record<string, string[][]> = {},
): SheetsClient & { tabs: Record<string, string[][]> } {
  const tabs: Record<string, string[][]> = JSON.parse(JSON.stringify(initial));
  return {
    tabs,
    async batchGet(ranges) {
      const out: Record<string, string[][]> = {};
      for (const r of ranges) out[r] = tabs[r] ?? [];
      return out;
    },
    // Writes at the range's start row and leaves anything past the written block
    // alone — same as the real Sheets API, so the surplus-tail clear is testable.
    async updateRange(range, values) {
      const t = range.split("!")[0];
      const m = range.match(/!A(\d+)/);
      const start = m ? Number(m[1]) - 1 : 0;
      const cur = (tabs[t] ??= []);
      for (let i = 0; i < start; i++) cur[i] ??= [];
      values.forEach((row, i) => { cur[start + i] = row.slice(); });
    },
    // Clears from the range's start row down, i.e. truncates to the rows above it.
    async clearRange(range) {
      const t = range.split("!")[0];
      const m = range.match(/!A(\d+):/);
      const keep = m ? Number(m[1]) - 1 : 1;
      tabs[t] = (tabs[t] ?? []).slice(0, keep);
    },
    async append(range, values) { const t = range.split("!")[0]; (tabs[t] ||= []).push(...values.map((r) => r.slice())); },
    async listTabs() { return Object.keys(tabs); },
    async addTabs(names) { for (const n of names) tabs[n] ||= []; },
  };
}
