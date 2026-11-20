// Thumbnail routes for the Kino bridge: the Thumbnails panel renders a PNG/JPEG in the browser,
// posts it here, and this module writes it to <Documents>/KinoProjects/Thumbnails/<projectId>/
// with a JSON sidecar, then imports it into the Kino library ("Thumbnails" bin) through Kino's
// local MCP server. Every /thumbs/* route is token-gated by server.mjs before it reaches this module.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { PROJECTS_DIR, isInside, reveal } from "./platform.mjs";

const ROOT = process.env.KINO_THUMBS_DIR ?? path.join(PROJECTS_DIR, "Thumbnails");
const KINO_MCP_URL = process.env.KINO_MCP_URL ?? "http://127.0.0.1:45680/mcp";
const PROJECT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // YouTube desktop limit; the panel warns per platform
const BIN_NAME = "Thumbnails";
const SIGNATURES = {
  png: buf => buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a,
  jpg: buf => buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
};

let log = () => {};
export const setLogger = fn => (log = fn);

// ---------- Kino MCP (local, metered) ----------
let kinoPromise = null;
const kino = () => {
  if (kinoPromise) return kinoPromise;
  kinoPromise = (async () => {
    const client = new Client({ name: "kino-thumbnails-panel", version: "1.0.0" });
    client.onclose = () => (kinoPromise = null);
    await client.connect(new StreamableHTTPClientTransport(new URL(KINO_MCP_URL)));
    return client;
  })().catch(error => {
    kinoPromise = null;
    throw new Error(`Kino's local MCP server is not reachable at ${KINO_MCP_URL} (${error.message}).`);
  });
  return kinoPromise;
};

export const kinoCall = async (name, args, timeout = 120_000) => {
  let result;
  try {
    result = await (await kino()).callTool({ name, arguments: args }, undefined, { timeout });
  } catch (error) {
    kinoPromise = null;
    throw error;
  }
  const text = (result.content ?? []).filter(part => part.type === "text").map(part => part.text).join("\n");
  if (result.isError) throw new Error(text.slice(0, 600) || `${name} failed`);
  if (result.structuredContent) return result.structuredContent;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
};

// ---------- files ----------
const slug = text =>
  String(text ?? "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .toLowerCase()
    .slice(0, 60) || "thumbnail";
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
const projectDir = projectId => path.join(ROOT, PROJECT_ID.test(projectId ?? "") ? projectId : "unsorted");
const inside = candidate => {
  const resolved = path.resolve(String(candidate ?? ""));
  return isInside(ROOT, resolved) ? resolved : null;
};
const sidecarOf = file => file.replace(/\.\w+$/, ".json");
const readSidecar = file => {
  try {
    return JSON.parse(fs.readFileSync(sidecarOf(file), "utf8"));
  } catch {
    return null;
  }
};
const writeSidecar = (file, meta) => fs.writeFileSync(sidecarOf(file), JSON.stringify(meta, null, 2));

const importToLibrary = async file => {
  const result = await kinoCall("addMediaToKino", { sources: [{ type: "localFile", absolutePath: file }], binName: BIN_NAME }, 180_000);
  const failed = result.failed?.[0];
  if (failed) throw new Error(`Kino could not import the file: ${failed.error ?? failed.message ?? JSON.stringify(failed).slice(0, 200)}`);
  const mediaId = result.media?.[0]?.mediaId ?? result.pending?.[0]?.mediaId;
  if (!mediaId) throw new Error("Kino did not return a media id for the import.");
  return mediaId;
};

const save = async body => {
  const format = body.format === "jpeg" || body.format === "jpg" ? "jpg" : body.format === "png" ? "png" : null;
  if (!format) throw Object.assign(new Error("format must be png or jpeg."), { status: 400 });
  if (typeof body.data !== "string" || !body.data) throw Object.assign(new Error("Missing image data."), { status: 400 });
  const bytes = Buffer.from(body.data.replace(/^data:image\/\w+;base64,/, ""), "base64");
  if (bytes.length > MAX_IMAGE_BYTES) throw Object.assign(new Error("Image is over 50 MB."), { status: 413 });
  if (!SIGNATURES[format](bytes)) throw Object.assign(new Error(`Data is not a ${format.toUpperCase()} image.`), { status: 400 });

  const dir = projectDir(body.projectId);
  fs.mkdirSync(dir, { recursive: true });
  // "Export all" can save two designs with one name inside the same second: number the later ones
  const stem = `${slug(body.name)}-${stamp()}`;
  let file = path.join(dir, `${stem}.${format}`);
  for (let n = 2; fs.existsSync(file) && n < 1000; n++) file = path.join(dir, `${stem}-${n}.${format}`);
  fs.writeFileSync(file, bytes, { flag: "wx" });
  const meta = {
    name: String(body.name ?? "").slice(0, 120),
    projectId: PROJECT_ID.test(body.projectId ?? "") ? body.projectId : null,
    preset: String(body.preset ?? "").slice(0, 40),
    width: Number(body.width) || null,
    height: Number(body.height) || null,
    bytes: bytes.length,
    created: new Date().toISOString().slice(0, 19),
    design: body.design && typeof body.design === "object" ? body.design : null,
  };
  writeSidecar(file, meta);
  log("thumbs-saved", { file, bytes: bytes.length });

  let mediaId = null;
  let importError = null;
  if (body.import !== false) {
    try {
      mediaId = await importToLibrary(file);
      meta.kino_media_id = mediaId;
      meta.kino_imported = new Date().toISOString().slice(0, 19);
      writeSidecar(file, meta);
    } catch (error) {
      importError = error.message;
      log("thumbs-import-failed", { error: error.message });
    }
  }
  return { file, bytes: bytes.length, mediaId, importError, dir };
};

const list = (projectId, limit = 60) => {
  const dir = projectDir(projectId);
  let names = [];
  try {
    names = fs.readdirSync(dir).filter(name => /\.(png|jpg)$/i.test(name));
  } catch {}
  return {
    dir,
    items: names
      .flatMap(name => {
        const file = path.join(dir, name);
        let stat;
        try {
          stat = fs.statSync(file);
        } catch {
          return []; // deleted between the listing and now
        }
        const meta = readSidecar(file) ?? {};
        return [{
          file,
          name,
          bytes: stat.size,
          mtime: stat.mtimeMs,
          preset: meta.preset ?? null,
          width: meta.width ?? null,
          height: meta.height ?? null,
          title: meta.name ?? null,
          mediaId: meta.kino_media_id ?? null,
        }];
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit),
  };
};

// ---------- agent prompts ----------
// The panel's prompt bar and New set dialog send their requests here (the Publish panel uses the same route).
// A request goes to the project's chat as a peer request (a durable queued turn); the chat is created
// first when the panel has none yet.
const CHAT_ID = /^[\w-]{6,200}$/;
const findChatId = value => {
  if (!value) return null;
  if (typeof value === "string") return CHAT_ID.test(value) ? value : null;
  if (typeof value !== "object") return null;
  // Kino returns the id as a bare string under `result`: { actionId, ran, result: "<chatId>" }
  for (const key of ["chatId", "conversationId", "id", "result"]) if (typeof value[key] === "string" && CHAT_ID.test(value[key])) return value[key];
  for (const v of Object.values(value)) {
    const found = typeof v === "object" ? findChatId(v) : null;
    if (found) return found;
  }
  return null;
};

const sendPrompt = async body => {
  const projectId = String(body?.projectId ?? "");
  if (!PROJECT_ID.test(projectId)) throw Object.assign(new Error("Invalid projectId."), { status: 400 });
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 20000) throw Object.assign(new Error("The prompt must be 1 to 20000 characters."), { status: 400 });
  const send = async chatId => {
    const requestId = randomUUID();
    const receipt = await kinoCall("sendPeerRequest", { chatId, requestId, message }, 60_000);
    return { requestId, receipt };
  };
  const given = typeof body.chatId === "string" && CHAT_ID.test(body.chatId) ? body.chatId : null;
  if (given) {
    try {
      return { chatId: given, created: false, ...(await send(given)) };
    } catch (error) {
      log("thumbs-prompt-retry", { chatId: given, error: error.message });
    }
  }
  const chatId = findChatId(await kinoCall("runUiAction", { actionId: "chat::NewChat", args: { projectId } }, 30_000));
  if (!chatId) throw new Error("Kino did not return a chat id for the new chat.");
  try {
    await kinoCall("runUiAction", { actionId: "chat::OpenInNewTab", args: { chatId } }, 15_000);
  } catch {}
  return { chatId, created: true, ...(await send(chatId)) };
};

// ---------- HTTP ----------
export const readBody = (req, limit) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("Request too large."), { status: 413 }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(Object.assign(new Error("Invalid JSON."), { status: 400 }));
      }
    });
    req.on("error", reject);
  });

export const handleThumbs = async (req, res, url, json, headers) => {
  try {
    if (req.method === "POST" && url.pathname === "/thumbs/save") {
      const body = await readBody(req, Math.ceil(MAX_IMAGE_BYTES * 1.4) + 256 * 1024);
      return json(200, await save(body));
    }
    if (req.method === "GET" && url.pathname === "/thumbs/list") {
      return json(200, list(url.searchParams.get("projectId"), Math.min(200, Number(url.searchParams.get("n")) || 60)));
    }
    if (req.method === "GET" && url.pathname === "/thumbs/file") {
      const file = inside(url.searchParams.get("path"));
      if (!file || !/\.(png|jpg)$/i.test(file) || !fs.existsSync(file)) return json(404, { error: "not found" });
      res.writeHead(200, { ...headers, "content-type": /\.png$/i.test(file) ? "image/png" : "image/jpeg", "cache-control": "no-store" });
      return fs.createReadStream(file).pipe(res);
    }
    if (req.method === "POST" && url.pathname === "/thumbs/reveal") {
      const body = await readBody(req, 16 * 1024);
      const target = body.file ? inside(body.file) : projectDir(body.projectId);
      if (!target) return json(400, { error: "Path is outside the thumbnails folder." });
      fs.mkdirSync(body.file ? path.dirname(target) : target, { recursive: true });
      reveal(target, { select: Boolean(body.file) });
      return json(200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/thumbs/import") {
      const body = await readBody(req, 16 * 1024);
      const file = inside(body.file);
      if (!file || !fs.existsSync(file)) return json(404, { error: "not found" });
      const meta = readSidecar(file) ?? {};
      if (meta.kino_media_id && !body.force) return json(200, { mediaId: meta.kino_media_id, reused: true });
      const mediaId = await importToLibrary(file);
      writeSidecar(file, { ...meta, kino_media_id: mediaId, kino_imported: new Date().toISOString().slice(0, 19) });
      return json(200, { mediaId, reused: false });
    }
    if (req.method === "POST" && url.pathname === "/thumbs/prompt") {
      const result = await sendPrompt(await readBody(req, 64 * 1024));
      log("thumbs-prompt", { chatId: result.chatId, requestId: result.requestId, created: result.created });
      return json(200, result);
    }
    if (req.method === "GET" && url.pathname === "/thumbs/prompt/status") {
      const requestId = url.searchParams.get("requestId") ?? "";
      if (!/^[0-9a-f-]{36}$/i.test(requestId)) return json(400, { error: "Invalid requestId." });
      try {
        return json(200, await kinoCall("getPeerRequest", { requestId }, 15_000));
      } catch (error) {
        // Kino throws an opaque error for ids it has no record of; report that plainly
        log("thumbs-prompt-status", { requestId, error: error.message.slice(0, 200) });
        return json(200, { status: "unavailable", detail: "Kino could not report on this request. Open the Thumbnails chat to see it." });
      }
    }
    return json(404, { error: "not found" });
  } catch (error) {
    log("thumbs-error", { path: url.pathname, error: error.message });
    return json(error.status ?? 500, { error: error.message });
  }
};

export const closeThumbs = async () => {
  const pending = kinoPromise;
  kinoPromise = null;
  try {
    await (await pending)?.close();
  } catch {}
};
