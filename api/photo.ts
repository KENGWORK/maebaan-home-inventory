import type { VercelRequest, VercelResponse } from "@vercel/node";
import { driveGet } from "./_drive.js";

// GET /api/photo?id=<driveFileId> -> the image bytes (files stay private in Drive;
// only this proxy, holding the service account, can read them).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = String(req.query.id ?? "");
  if (!id) return res.status(400).json({ error: "id required" });
  try {
    const { body, mime } = await driveGet(id);
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).send(body);
  } catch (e) {
    console.error(e);
    res.status(404).json({ error: "photo not found" });
  }
}
