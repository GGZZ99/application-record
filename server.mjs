import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const STORE_EXAMPLE_PATH = path.join(DATA_DIR, "store.example.json");
const PROFILE_PATH = path.join(DATA_DIR, "profile.json");
const PROFILE_EXAMPLE_PATH = path.join(DATA_DIR, "profile.example.json");
const SCREENSHOTS_DIR = path.join(DATA_DIR, "screenshots");
const RESUME_DIR = path.join(DATA_DIR, "resume");
const EXTENSION_DIR = path.join(ROOT, "extension");
const PORT = Number(process.env.PORT) || 8787;
const HOST = "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
};

const IMAGE_EXT = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(payload);
}

function sendText(res, status, body, contentType) {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
  await fs.mkdir(RESUME_DIR, { recursive: true });
}

async function ensureStore() {
  await ensureDirs();
  try {
    await fs.access(STORE_PATH);
  } catch {
    try {
      await fs.copyFile(STORE_EXAMPLE_PATH, STORE_PATH);
    } catch {
      const seed = {
        version: 1,
        fields: [],
        records: [],
      };
      await fs.writeFile(STORE_PATH, `${JSON.stringify(seed, null, 2)}\n`, "utf8");
    }
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(STORE_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeStoreAtomic(data) {
  await ensureStore();
  const tmp = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
  const text = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(tmp, text, "utf8");
  await fs.rename(tmp, STORE_PATH);
}

function emptyProfile() {
  return { version: 1, entries: [] };
}

function validateProfile(profile) {
  if (!profile || profile.version !== 1 || !Array.isArray(profile.entries) || profile.entries.length > 1000) {
    throw new Error("资料格式不正确");
  }
  const ids = new Set();
  for (const entry of profile.entries) {
    if (
      !entry ||
      !["id", "group", "label", "value"].every((k) => typeof entry[k] === "string") ||
      !entry.id ||
      ids.has(entry.id) ||
      !Array.isArray(entry.aliases) ||
      !entry.aliases.every((x) => typeof x === "string") ||
      (entry.source !== undefined && typeof entry.source !== "string") ||
      ["date", "pending"].some((k) => typeof entry[k] !== "boolean") ||
      entry.value.length > 30000
    ) {
      throw new Error("资料字段不正确或编号重复");
    }
    ids.add(entry.id);
  }
  return profile;
}

async function ensureProfile() {
  await ensureDirs();
  try {
    await fs.access(PROFILE_PATH);
  } catch {
    try {
      await fs.copyFile(PROFILE_EXAMPLE_PATH, PROFILE_PATH);
    } catch {
      await fs.writeFile(PROFILE_PATH, `${JSON.stringify(emptyProfile(), null, 2)}\n`, "utf8");
    }
  }
}

async function readProfile() {
  await ensureProfile();
  const raw = await fs.readFile(PROFILE_PATH, "utf8");
  return validateProfile(JSON.parse(raw));
}

async function writeProfileAtomic(data) {
  await ensureProfile();
  validateProfile(data);
  const tmp = `${PROFILE_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(tmp, PROFILE_PATH);
}

async function handleProfileApi(req, res) {
  if (req.method === "GET" || req.method === "HEAD") {
    send(res, 200, await readProfile());
    return;
  }
  if (req.method === "PUT") {
    let data;
    try {
      data = JSON.parse((await readBody(req)).toString("utf8"));
    } catch {
      send(res, 400, { error: "Invalid JSON" });
      return;
    }
    try {
      await writeProfileAtomic(data);
    } catch (err) {
      send(res, 400, { error: err.message || "Invalid profile" });
      return;
    }
    send(res, 200, data);
    return;
  }
  send(res, 405, { error: "Method not allowed" });
}

function safePublicPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = decoded === "/" ? "/index.html" : decoded;
  const resolved = path.resolve(PUBLIC_DIR, `.${relative}`);
  if (!resolved.startsWith(PUBLIC_DIR)) return null;
  return resolved;
}

function safeScreenshotName(name) {
  if (!name || !/^[A-Za-z0-9._-]+$/.test(name)) return null;
  if (name.includes("..")) return null;
  return name;
}

function safeResumeRelPath(relPath) {
  if (relPath == null) return "";
  if (typeof relPath !== "string") return null;
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized) return "";
  if (normalized.includes("\0")) return null;
  const parts = normalized.split("/");
  if (parts.some((p) => !p || p === "." || p === "..")) return null;
  const resolved = path.resolve(RESUME_DIR, ...parts);
  if (resolved !== RESUME_DIR && !resolved.startsWith(RESUME_DIR + path.sep)) return null;
  return normalized;
}

function resumeAbsPath(relPath) {
  const safe = safeResumeRelPath(relPath);
  if (safe == null) return null;
  return safe ? path.join(RESUME_DIR, ...safe.split("/")) : RESUME_DIR;
}

function resumePublicUrl(relPath) {
  const safe = safeResumeRelPath(relPath);
  if (safe == null || safe === "") return null;
  return `/resume-files/${safe.split("/").map(encodeURIComponent).join("/")}`;
}

function resumeKind(ext) {
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(ext)) return "image";
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "docx";
  if (ext === ".doc") return "doc";
  if (ext === ".md") return "markdown";
  if (ext === ".txt") return "text";
  return "other";
}

function imageTypeLabel(ext) {
  return (
    {
      ".png": "PNG",
      ".jpg": "JPG",
      ".jpeg": "JPEG",
      ".webp": "WEBP",
      ".gif": "GIF",
      ".svg": "SVG",
    }[ext] || "图片"
  );
}

function slugNoteBase(title) {
  const base = String(title || "")
    .trim()
    .replace(/[\\/:*?"<>|\r\n]+/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 40)
    .trim();
  return base || "未命名笔记";
}

async function handleResumeList(req, res) {
  await ensureDirs();
  const url = new URL(req.url || "/", `http://${HOST}`);
  const rel = safeResumeRelPath(url.searchParams.get("path") || "");
  if (rel == null) {
    send(res, 400, { error: "Invalid path" });
    return;
  }
  const abs = resumeAbsPath(rel);
  let entries;
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") {
      send(res, 404, { error: "Directory not found" });
      return;
    }
    throw err;
  }

  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    const childAbs = path.join(abs, entry.name);
    if (entry.isDirectory()) {
      let count = 0;
      try {
        const kids = await fs.readdir(childAbs);
        count = kids.filter((n) => !n.startsWith(".")).length;
      } catch {
        count = 0;
      }
      files.push({
        name: entry.name,
        path: childRel,
        type: "dir",
        kind: "folder",
        count,
        mtime: (await fs.stat(childAbs)).mtime.toISOString(),
      });
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    const kind = resumeKind(ext);
    const stat = await fs.stat(childAbs);
    files.push({
      name: entry.name,
      path: childRel,
      type: "file",
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      ext,
      kind,
      imageType: kind === "image" ? imageTypeLabel(ext) : undefined,
      url: resumePublicUrl(childRel),
    });
  }

  files.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, "zh");
  });

  send(res, 200, {
    root: "data/resume",
    path: rel,
    dir: rel ? `data/resume/${rel}` : "data/resume",
    files,
  });
}

async function handleResumeSave(req, res) {
  try {
    const raw = (await readBody(req)).toString("utf8");
    const data = JSON.parse(raw);
    const title = String(data.title || "").trim();
    const body = String(data.body ?? "");
    if (!title) {
      send(res, 400, { error: "标题不能为空" });
      return;
    }

    const folder = safeResumeRelPath(data.folder || "");
    if (folder == null) {
      send(res, 400, { error: "无效目录" });
      return;
    }

    let filename = null;
    if (data.filename) {
      filename = safeResumeRelPath(String(data.filename));
      if (filename == null) {
        send(res, 400, { error: "无效文件名" });
        return;
      }
      if (path.extname(filename).toLowerCase() !== ".md") {
        send(res, 400, { error: "仅支持保存为 .md 文件" });
        return;
      }
    } else {
      let base = `${slugNoteBase(title)}_${Date.now().toString(36)}.md`;
      filename = folder ? `${folder}/${base}` : base;
      if (safeResumeRelPath(filename) == null) {
        base = `note_${Date.now().toString(36)}.md`;
        filename = folder ? `${folder}/${base}` : base;
      }
    }

    await ensureDirs();
    const abs = resumeAbsPath(filename);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    const content = `${title}\n\n---\n\n${body.replace(/\s+$/, "")}\n`;
    await fs.writeFile(abs, content, "utf8");
    send(res, 200, {
      ok: true,
      filename,
      url: resumePublicUrl(filename),
      path: `data/resume/${filename}`,
    });
  } catch (err) {
    send(res, 400, { error: err.message || "保存失败" });
  }
}

async function handleResumeApi(req, res) {
  if (req.method === "GET") {
    await handleResumeList(req, res);
    return;
  }
  if (req.method === "POST") {
    await handleResumeSave(req, res);
    return;
  }
  send(res, 405, { error: "Method not allowed" });
}

async function serveResumeFile(req, res, relPath) {
  const safe = safeResumeRelPath(relPath);
  if (safe == null || safe === "") {
    send(res, 400, { error: "Invalid filename" });
    return;
  }
  const filePath = resumeAbsPath(safe);
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(safe).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    const baseName = path.basename(safe);
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(baseName)}`,
    });
    res.end(data);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      send(res, 404, { error: "Not found" });
      return;
    }
    send(res, 500, { error: "Internal server error" });
  }
}

async function serveStatic(req, res) {
  const filePath = safePublicPath(req.url || "/");
  if (!filePath) {
    send(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    sendText(res, 200, data, MIME[ext] || "application/octet-stream");
  } catch (err) {
    if (err && err.code === "ENOENT") {
      send(res, 404, { error: "Not found" });
      return;
    }
    send(res, 500, { error: "Internal server error" });
  }
}

async function serveScreenshot(req, res, filename) {
  const safe = safeScreenshotName(filename);
  if (!safe) {
    send(res, 400, { error: "Invalid filename" });
    return;
  }
  const filePath = path.join(SCREENSHOTS_DIR, safe);
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(safe).toLowerCase();
    sendText(res, 200, data, MIME[ext] || "application/octet-stream");
  } catch (err) {
    if (err && err.code === "ENOENT") {
      send(res, 404, { error: "Not found" });
      return;
    }
    send(res, 500, { error: "Internal server error" });
  }
}

async function handleStoreApi(req, res) {
  if (req.method === "GET") {
    try {
      const store = await readStore();
      send(res, 200, store);
    } catch (err) {
      send(res, 500, { error: err.message || "Failed to read store" });
    }
    return;
  }

  if (req.method === "PUT") {
    try {
      const raw = (await readBody(req)).toString("utf8");
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        send(res, 400, { error: "Store must be a JSON object" });
        return;
      }
      if (!Array.isArray(data.fields) || !Array.isArray(data.records)) {
        send(res, 400, { error: "Store must include fields[] and records[]" });
        return;
      }
      await writeStoreAtomic(data);
      send(res, 200, { ok: true });
    } catch (err) {
      send(res, 400, { error: err.message || "Invalid JSON body" });
    }
    return;
  }

  send(res, 405, { error: "Method not allowed" });
}

async function handleScreenshotUpload(req, res) {
  if (req.method !== "POST") {
    send(res, 405, { error: "Method not allowed" });
    return;
  }

  const contentType = (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  const ext = IMAGE_EXT[contentType];
  if (!ext) {
    send(res, 400, { error: "Only image/png, image/jpeg, image/webp, image/gif are supported" });
    return;
  }

  const buffer = await readBody(req);
  if (!buffer.length) {
    send(res, 400, { error: "Empty image body" });
    return;
  }
  if (buffer.length > 12 * 1024 * 1024) {
    send(res, 413, { error: "Image too large (max 12MB)" });
    return;
  }

  await ensureDirs();
  const filename = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}${ext}`;
  const filePath = path.join(SCREENSHOTS_DIR, filename);
  await fs.writeFile(filePath, buffer);
  send(res, 200, {
    ok: true,
    filename,
    url: `/screenshots/${filename}`,
    path: `data/screenshots/${filename}`,
  });
}

async function handleScreenshotDelete(req, res, filename) {
  if (req.method !== "DELETE") {
    send(res, 405, { error: "Method not allowed" });
    return;
  }
  const safe = safeScreenshotName(filename);
  if (!safe) {
    send(res, 400, { error: "Invalid filename" });
    return;
  }
  const filePath = path.join(SCREENSHOTS_DIR, safe);
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (!err || err.code !== "ENOENT") {
      send(res, 500, { error: err.message || "Failed to delete" });
      return;
    }
  }
  send(res, 200, { ok: true });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = req.url || "/";
    const pathname = decodeURIComponent(url.split("?")[0]);

    if (pathname === "/api/store") {
      await handleStoreApi(req, res);
      return;
    }

    if (pathname === "/api/screenshots") {
      await handleScreenshotUpload(req, res);
      return;
    }

    const apiShot = pathname.match(/^\/api\/screenshots\/([^/]+)$/);
    if (apiShot) {
      await handleScreenshotDelete(req, res, apiShot[1]);
      return;
    }

    const shot = pathname.match(/^\/screenshots\/([^/]+)$/);
    if (shot) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        send(res, 405, { error: "Method not allowed" });
        return;
      }
      await serveScreenshot(req, res, shot[1]);
      return;
    }

    if (pathname === "/api/profile") {
      await handleProfileApi(req, res);
      return;
    }

    if (pathname === "/api/extension") {
      if (req.method !== "GET" && req.method !== "HEAD") {
        send(res, 405, { error: "Method not allowed" });
        return;
      }
      send(res, 200, {
        dir: path.resolve(EXTENSION_DIR),
        relative: "extension",
        name: "网申资料助手",
      });
      return;
    }

    if (pathname === "/api/resume") {
      await handleResumeApi(req, res);
      return;
    }

    if (pathname.startsWith("/resume-files/")) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        send(res, 405, { error: "Method not allowed" });
        return;
      }
      const rel = decodeURIComponent(pathname.slice("/resume-files/".length));
      await serveResumeFile(req, res, rel);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, { error: "Method not allowed" });
      return;
    }
    await serveStatic(req, res);
  } catch (err) {
    send(res, 500, { error: err.message || "Internal server error" });
  }
});

await ensureStore();
await ensureProfile();
server.listen(PORT, HOST, () => {
  console.log(`Application Record running at http://${HOST}:${PORT}`);
});
