// Style-string factories ported verbatim from the design's DCLogic helper methods.
// They return CSS declaration strings; wrap with css() at the call site.

export function chip(sel: boolean, wide?: boolean): string {
  return (
    "border:none;cursor:pointer;flex:" +
    (wide ? "1" : "none") +
    ";border-radius:16px;padding:11px 15px;" +
    "font:500 13px Mitr,sans-serif;white-space:nowrap;" +
    (sel
      ? "color:#ffffff;background:linear-gradient(145deg,#7A6AE2,#5B49C9);box-shadow:5px 7px 15px rgba(90,68,180,.34),-3px -4px 10px rgba(255,255,255,.6),inset 2px 2px 5px rgba(255,255,255,.28)"
      : "color:#5B5375;background:#F5EFFC;box-shadow:5px 6px 14px rgba(120,95,175,.16),-4px -5px 12px #ffffff,inset 1px 1px 3px #ffffff")
  );
}

export function codeBadge(strong: boolean): string {
  return strong
    ? 'flex:none;border-radius:12px;padding:7px 10px;font:500 11px "IBM Plex Mono",monospace;letter-spacing:.6px;color:#ffffff;background:linear-gradient(145deg,#7A6AE2,#5B49C9);box-shadow:4px 5px 12px rgba(90,68,180,.32),inset 2px 2px 5px rgba(255,255,255,.28)'
    : 'flex:none;border-radius:11px;padding:6px 9px;font:500 10.5px "IBM Plex Mono",monospace;letter-spacing:.6px;color:#5B49C9;background:#EFE9FC;box-shadow:inset 2px 3px 7px rgba(120,95,175,.2),2px 3px 8px rgba(120,95,175,.14)';
}

export function ghost(): string {
  return "border:none;cursor:pointer;border-radius:13px;padding:7px 11px;font:500 11px Mitr,sans-serif;color:#9A90BC;background:#F1ECFA;box-shadow:inset 2px 3px 7px rgba(120,95,175,.16),inset -2px -2px 6px #ffffff";
}

export function pill(bg: string, fg: string): string {
  return (
    "flex:none;border-radius:13px;padding:7px 10px;font:500 11px Mitr,sans-serif;color:" +
    fg +
    ";background:" +
    bg +
    ";box-shadow:inset 2px 3px 7px rgba(120,95,175,.14),3px 4px 9px rgba(120,95,175,.14)"
  );
}

export function shot(w: number): string {
  return (
    "position:relative;border:none;cursor:zoom-in;flex:none;width:" +
    w +
    "px;height:" +
    w * 0.78 +
    "px;border-radius:18px;background:repeating-linear-gradient(135deg,#E9E1F6 0 8px,#E0D7F1 8px 16px);box-shadow:inset 3px 4px 9px rgba(90,68,150,.18),inset -2px -3px 8px rgba(255,255,255,.7);display:grid;place-items:center;text-align:center;padding:4px"
  );
}

export const PRIM =
  "border:none;cursor:pointer;border-radius:20px;padding:16px;font:500 15px Mitr,sans-serif;color:#ffffff;background:linear-gradient(145deg,#7A6AE2,#5B49C9);box-shadow:8px 11px 22px rgba(90,68,180,.32),-4px -6px 12px rgba(255,255,255,.5),inset 2px 3px 6px rgba(255,255,255,.26)";
export const SEC =
  "border:none;cursor:pointer;border-radius:20px;padding:16px;font:500 15px Mitr,sans-serif;color:#5B5375;background:#F1ECFA;box-shadow:inset 4px 5px 12px rgba(120,95,175,.16),inset -3px -4px 10px #ffffff";
export const DANGER =
  "border:none;cursor:pointer;border-radius:20px;padding:16px;font:500 15px Mitr,sans-serif;color:#ffffff;background:linear-gradient(145deg,#E07A76,#C24A46);box-shadow:8px 11px 22px rgba(194,74,70,.34),-4px -6px 12px rgba(255,255,255,.5)";
