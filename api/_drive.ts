import { serviceJwt } from "./_sheets.js";

// Photo storage in a Google Drive folder shared with the service account.
// Scope drive.file: the SA can create files and read back the ones it created.

const SCOPE = ["https://www.googleapis.com/auth/drive.file"];

function jwt() {
  return serviceJwt(SCOPE);
}

/** Upload bytes into DRIVE_FOLDER_ID, return the new file id. */
export async function driveUpload(bytes: Buffer, mime: string, name: string): Promise<string> {
  const folder = process.env.DRIVE_FOLDER_ID as string;
  if (!folder) throw new Error("DRIVE_FOLDER_ID not set");
  const { token } = await jwt().getAccessToken();
  const boundary = `maebaan${Date.now()}${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name, parents: [folder] });
  const pre =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
  const body = new Blob([pre, new Uint8Array(bytes), `\r\n--${boundary}--`]);
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (!res.ok) {
    console.error("Drive upload", res.status, await res.text());
    throw new Error(`Drive upload error ${res.status}`);
  }
  const j = (await res.json()) as { id?: string };
  if (!j.id) throw new Error("Drive upload returned no id");
  return j.id;
}

/** Fetch a file's bytes + mime type by id. */
export async function driveGet(id: string): Promise<{ body: Buffer; mime: string }> {
  const { token } = await jwt().getAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    console.error("Drive get", res.status, await res.text());
    throw new Error(`Drive get error ${res.status}`);
  }
  const mime = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  return { body: Buffer.from(await res.arrayBuffer()), mime };
}
