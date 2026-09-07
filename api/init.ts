import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ensureSeeded, realClient } from "./_sheets.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    res.status(200).json(await ensureSeeded(realClient()));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
}
