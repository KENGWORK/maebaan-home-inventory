// Photo storage in the user's Google Drive.
//
// Service accounts have no storage quota on consumer (gmail.com) accounts, so an
// upload done as the service account is rejected with 403 storageQuotaExceeded.
// Uploads must therefore run as the user, via an OAuth2 refresh token.
//
// Scope drive.file: the app only ever sees the files and the folder it created
// itself — it cannot read the rest of the user's Drive.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FOLDER_MIME = "application/vnd.google-apps.folder";

let cachedToken: { value: string; exp: number } | null = null;
let cachedFolderId: string | null = null;

/** A short-lived access token, minted from the refresh token and cached until it nears expiry. */
async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken)
    throw new Error("Google OAuth env not set (GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN)");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    // Body may echo the client id — log it, never return it.
    console.error("Google OAuth token", res.status, await res.text());
    throw new Error(`Google OAuth token error ${res.status}`);
  }
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cachedToken.value;
}

/** Find-or-create the photo folder. drive.file scope only lists app-created files, so once
 *  this folder exists a later cold start still finds it by name. */
async function ensureFolder(token: string): Promise<string> {
  if (cachedFolderId) return cachedFolderId;
  const name = process.env.DRIVE_FOLDER_NAME || "Maebaan Photos";
  const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const list = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (list.ok) {
    const j = (await list.json()) as { files?: { id: string }[] };
    if (j.files?.[0]?.id) {
      cachedFolderId = j.files[0].id;
      return cachedFolderId;
    }
  }
  const create = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
  });
  if (!create.ok) {
    console.error("Drive folder create", create.status, await create.text());
    throw new Error(`Drive folder create error ${create.status}`);
  }
  const j = (await create.json()) as { id: string };
  cachedFolderId = j.id;
  return cachedFolderId;
}

/** Upload bytes into the photo folder, return the new file id. */
export async function driveUpload(bytes: Buffer, mime: string, name: string): Promise<string> {
  const token = await accessToken();
  const parent = await ensureFolder(token);
  const boundary = `maebaan${Date.now()}${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name, parents: [parent] });
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
  const token = await accessToken();
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
