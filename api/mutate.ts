import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Msg } from "../src/mutations";
import { realClient } from "./_sheets";
import { runMutation } from "./_run";

const TYPES: Msg["type"][] = [
  "add", "move", "use", "newItem", "delItem", "setItemField",
  "newPlace", "renamePlace", "setPlaceCode", "delPlace",
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) ?? {};
    const { owner, ...msg } = body as { owner?: string } & Msg;
    if (!owner || !msg.type) return res.status(400).json({ error: "owner and type required" });
    if (!TYPES.includes((msg as Msg).type))
      return res.status(400).json({ error: "unknown mutation type" });
    const r = await runMutation(realClient(), msg as Msg, owner);
    if ("error" in r) return res.status(400).json(r);
    res.status(200).json({ ...r.snapshot, result: r.result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
}
