import type { CSSProperties } from "react";

/**
 * Parse a plain CSS declaration string ("padding:8px;color:#fff") into a React
 * style object. Lets the design's inline style strings be pasted verbatim.
 */
export function css(decl: string): CSSProperties {
  const out: Record<string, string> = {};
  for (const part of splitTopLevel(decl)) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const rawKey = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!rawKey || !value) continue;
    const key = rawKey.startsWith("--")
      ? rawKey
      : rawKey.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[key] = value;
  }
  return out as CSSProperties;
}

/** Split on ";" but not inside parentheses (rgba(), linear-gradient(), ...). */
function splitTopLevel(decl: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of decl) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === ";" && depth === 0) {
      parts.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf);
  return parts;
}
