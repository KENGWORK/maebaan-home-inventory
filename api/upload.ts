import type { VercelRequest, VercelResponse } from "@vercel/node";
import { driveUpload } from "./_drive.js";

// Raw image bytes in the request body -> Drive -> { id }.
export const config = { api: { bodyParser: false } };

const MAX = 9_000_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const mime = (String(req.headers["content-type"] ?? "image/jpeg")).split(";")[0].trim();
    if (!mime.startsWith("image/")) return res.status(400).json({ error: "image only" });
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req as unknown as AsyncIterable<Buffer>) {
      size += c.length;
      if (size > MAX) return res.status(413).json({ error: "image too large" });
      chunks.push(c);
    }
    const buf = Buffer.concat(chunks);
    if (!buf.length) return res.status(400).json({ error: "empty body" });
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const id = await driveUpload(buf, mime, `maebaan-${Date.now()}.${ext}`);
    res.status(200).json({ id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "upload failed" });
  }
}
