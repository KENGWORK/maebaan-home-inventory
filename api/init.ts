import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ensureSeeded, realClient } from "./_sheets";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    res.status(200).json(await ensureSeeded(realClient()));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
}
