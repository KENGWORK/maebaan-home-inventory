import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readState, realClient } from "./_sheets";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    res.status(200).json(await readState(realClient()));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
}
