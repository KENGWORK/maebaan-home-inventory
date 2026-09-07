// Client-side photo handling: downscale + compress before upload, and resolve a
// stored Drive id to a URL the <img> tag can load (served by /api/photo).

/** A photo being worked on in the UI: a freshly captured file, an uploaded id, or both. */
export interface Shot {
  /** object URL for local preview, before upload */
  local?: string;
  /** the File to upload */
  file?: File;
  /** Google Drive file id, once uploaded */
  id?: string;
}

/** `/api/photo?id=…` for a stored id, or the local object URL for a fresh capture. */
export function shotSrc(s: Shot): string {
  if (s.id) return `/api/photo?id=${encodeURIComponent(s.id)}`;
  return s.local ?? "";
}

export function idSrc(id: string): string {
  return `/api/photo?id=${encodeURIComponent(id)}`;
}

/**
 * Downscale to `maxEdge` px on the long side and re-encode as JPEG, so a 4 MB
 * phone photo becomes ~200–400 KB. Falls back to the original File on any error.
 */
export async function compressImage(file: File, maxEdge = 1600, quality = 0.8): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", quality),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Compress then POST to /api/upload; returns the Drive file id. Throws on failure. */
export async function uploadPhoto(file: File): Promise<string> {
  const blob = await compressImage(file);
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": blob.type || "image/jpeg" },
    body: blob,
  });
  const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
  if (!res.ok || !body?.id) throw new Error(body?.error ?? `upload failed (${res.status})`);
  return body.id;
}
