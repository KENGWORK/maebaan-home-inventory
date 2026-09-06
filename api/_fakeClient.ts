// api/_fakeClient.ts — in-memory SheetsClient for tests
import type { SheetsClient } from "./_sheets";

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
    async updateRange(range, values) { tabs[range.split("!")[0]] = values.map((r) => r.slice()); },
    async clearRange(range) { const t = range.split("!")[0]; tabs[t] = (tabs[t] ?? []).slice(0, 1); },
    async append(range, values) { const t = range.split("!")[0]; (tabs[t] ||= []).push(...values.map((r) => r.slice())); },
    async listTabs() { return Object.keys(tabs); },
    async addTabs(names) { for (const n of names) tabs[n] ||= []; },
  };
}
