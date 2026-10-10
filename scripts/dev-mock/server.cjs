// A tiny stand-in for Supabase (Auth + PostgREST) so the real pages render with sample data.
const http = require("http");
const path = require("path");
const fs = require("fs");
const FIX = path.join(__dirname, "fixtures.cjs");
const log = [];
// The fixtures are read again (so edits apply without a restart), at most once a second.
let cached = null;
function fixtures() {
  if (cached && Date.now() - cached.at < 1000) return cached.F;
  const id = require.resolve(FIX);
  delete require.cache[id];
  const F = require(FIX);
  // require() also keeps every fresh copy in module.children: let the old ones go
  // (otherwise memory grows with every request until the process is killed).
  module.children = module.children.filter((m) => m.id !== id || m.exports === F);
  cached = { at: Date.now(), F };
  return F;
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}
const WRITABLE = new Set(["daily_word_plays", ...String(process.env.MOCK_WRITES || "").split(",").filter(Boolean)]);
// The fixtures are read again on every request; tables that remember writes keep their rows here.
const stores = new Map();
const tableRows = (F, name) => {
  if (!WRITABLE.has(name)) return F.tables[name];
  if (!stores.has(name)) stores.set(name, [...(F.tables[name] ?? [])]);
  return stores.get(name);
};

function applyFilters(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns", "or", "and"].includes(k)) continue;
    if (k.includes(".")) continue; // filters on embedded tables: ignore
    const m = /^(not\.)?(eq|neq|in|is|gte|lte|gt|lt|like|ilike)\.(.*)$/.exec(v);
    if (!m) continue;
    const [, not, op, raw] = m;
    const has = out.length && Object.prototype.hasOwnProperty.call(out[0], k);
    if (!has) continue;
    const test = (row) => {
      const x = row[k];
      let r;
      if (op === "eq") r = String(x) === raw;
      else if (op === "neq") r = String(x) !== raw;
      else if (op === "in") r = raw.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(x));
      else if (op === "is") r = raw === "null" ? x === null || x === undefined : String(x) === raw;
      else if (op === "gte") r = x !== null && String(x) >= raw;
      else if (op === "lte") r = x !== null && String(x) <= raw;
      else if (op === "gt") r = x !== null && String(x) > raw;
      else if (op === "lt") r = x !== null && String(x) < raw;
      else r = true;
      return not ? !r : r;
    };
    out = out.filter(test);
  }
  const offset = Number(params.get("offset") || 0);
  const limit = params.get("limit");
  if (offset || limit) out = out.slice(offset, limit ? offset + Number(limit) : undefined);
  return out;
}
/** A flat sample picture: a "thumbnail" (16:9, a big word) or a channel picture (square). */
function sampleImage(res, p) {
  let h = 0;
  for (const ch of p) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hues = ["#E8630D", "#178C7C", "#3159C9", "#6B4FD6", "#B84070", "#B4890E", "#2B9757", "#C2410C", "#0E7490"];
  const bg = hues[h % hues.length];
  const fg = hues[(h >> 5) % hues.length] === bg ? "#111" : hues[(h >> 5) % hues.length];
  const avatar = p.includes("/c/");
  const label = (/\/(v\d+|lib\d+|ch\d+)\./.exec(p) || [, "IMG"])[1].replace("lib", "").replace("ch", "").toUpperCase();
  const svg = avatar
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88"><rect width="88" height="88" fill="${bg}"/><circle cx="44" cy="36" r="16" fill="#fff" opacity=".85"/><rect x="18" y="58" width="52" height="30" rx="15" fill="#fff" opacity=".85"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="${bg}"/><rect x="760" y="120" width="420" height="480" rx="40" fill="${fg}" opacity=".9"/><circle cx="970" cy="300" r="110" fill="#fff" opacity=".9"/><text x="80" y="420" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="260" fill="#fff">${label}</text><rect x="80" y="470" width="520" height="40" rx="8" fill="#111" opacity=".55"/></svg>`;
  res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "max-age=3600", "Access-Control-Allow-Origin": "*" });
  res.end(svg);
}
// Resumable uploads (TUS, what Supabase Storage speaks): id → { length, offset, name }.
/** MOCK_VIDEO=/path/to/file.mp4 (or .webm): the file every signed review-videos link plays (with Range support). */
function sampleVideo(req, res) {
  const file = process.env.MOCK_VIDEO;
  if (!file || !fs.existsSync(file)) return send(res, 404, { error: "no sample video (set MOCK_VIDEO)" });
  const size = fs.statSync(file).size;
  const m = /bytes=(\d*)-(\d*)/.exec(String(req.headers.range || ""));
  // (Headless Chromium can't play H.264: a .webm sample works there.)
  const head = { "Content-Type": file.endsWith(".webm") ? "video/webm" : "video/mp4", "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*" };
  if (!m) {
    res.writeHead(200, { ...head, "Content-Length": size });
    return req.method === "HEAD" ? res.end() : fs.createReadStream(file).pipe(res);
  }
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
  res.writeHead(206, { ...head, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${size}` });
  return req.method === "HEAD" ? res.end() : fs.createReadStream(file, { start, end }).pipe(res);
}

const uploads = new Map();
const TUS_HEADERS = { "Tus-Resumable": "1.0.0", "Access-Control-Expose-Headers": "Location, Upload-Offset, Upload-Length, Tus-Resumable" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let body = "";
  req.bytes = 0;
  req.on("data", (c) => {
    body += c;
    req.bytes += c.length;
  });
  // MOCK_DELAY=1500: every database answer takes that long (to see the loading screens).
  req.on("end", () => setTimeout(() => answer(req, res, url, body), Number(process.env.MOCK_DELAY) || 0));
});
function answer(req, res, url, body) {
  {
    const F = fixtures();
    log.push(`${req.method} ${url.pathname}${url.search}`);
    if (process.env.MOCK_LOG) console.log(req.method, decodeURIComponent(url.pathname + url.search).slice(0, 300));
    // "*" doesn't cover Authorization in browsers: echo what was asked for.
    if (req.method === "OPTIONS") return send(res, 204, undefined, { "Access-Control-Allow-Headers": req.headers["access-control-request-headers"] || "*", "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, HEAD, OPTIONS" });
    // Sample exchange rates (start the app with FX_RATES_URL=http://127.0.0.1:54321/fx/latest/USD).
    if (url.pathname === "/fx/latest/USD")
      return send(res, 200, {
        result: "success",
        base_code: "USD",
        time_last_update_utc: new Date(Date.now() - 6 * 3600e3).toUTCString(),
        rates: { USD: 1, EUR: 0.92, GBP: 0.79, RON: 4.58, CAD: 1.36, AUD: 1.52, CHF: 0.88, JPY: 149.5, INR: 83.4, BRL: 5.1, MXN: 17.9, PLN: 3.98, SEK: 10.6, NOK: 10.8, DKK: 6.86, HUF: 362, CZK: 23.1, TRY: 34.2, AED: 3.6725, ZAR: 18.4, MDL: 17.7, BGN: 1.8, RSD: 107.8, UAH: 41.2, KRW: 1380, CNY: 7.2, SGD: 1.34, NZD: 1.66, HKD: 7.8, ILS: 3.7 },
      });
    if (url.pathname === "/auth/v1/user") return send(res, 200, F.user);
    if (url.pathname.startsWith("/auth/v1/")) return send(res, 200, {});
    if (url.pathname.startsWith("/storage/v1/")) {
      // Resumable uploads (tus-js-client): create (with the first chunk), then PATCH the rest.
      // MOCK_UPLOAD_FAIL=1 refuses them like a full bucket would.
      if (url.pathname === "/storage/v1/upload/resumable" && req.method === "POST") {
        if (process.env.MOCK_UPLOAD_FAIL) return send(res, 413, { error: "Payload too large", message: "The object exceeded the maximum allowed size" }, TUS_HEADERS);
        const id = Math.random().toString(36).slice(2);
        const meta = Object.fromEntries(String(req.headers["upload-metadata"] || "").split(",").filter(Boolean).map((kv) => { const [k, v] = kv.trim().split(" "); return [k, v ? Buffer.from(v, "base64").toString() : ""]; }));
        uploads.set(id, { length: Number(req.headers["upload-length"] || 0), offset: req.bytes, name: `${meta.bucketName}/${meta.objectName}` });
        return send(res, 201, undefined, { ...TUS_HEADERS, Location: `http://127.0.0.1:54321/storage/v1/upload/resumable/${id}`, "Upload-Offset": String(req.bytes) });
      }
      const tus = /^\/storage\/v1\/upload\/resumable\/([a-z0-9]+)$/.exec(url.pathname);
      if (tus) {
        const u = uploads.get(tus[1]);
        if (!u) return send(res, 404, undefined, TUS_HEADERS);
        if (req.method === "PATCH") u.offset += req.bytes;
        return send(res, req.method === "PATCH" ? 204 : 200, undefined, { ...TUS_HEADERS, "Upload-Offset": String(u.offset), "Upload-Length": String(u.length), "Cache-Control": "no-store" });
      }
      // Removing files (storage.remove): accepted.
      if (req.method === "DELETE" && url.pathname.startsWith("/storage/v1/object/")) return send(res, 200, []);
      // Batch signing (createSignedUrls): links to generated sample images below.
      if (req.method === "POST" && /\/object\/sign\/[^/]+\/?$/.test(url.pathname)) {
        const bucket = url.pathname.split("/sign/")[1].replace(/\/$/, "");
        const paths = (body ? JSON.parse(body).paths : null) ?? [];
        return send(res, 200, paths.map((p) => ({ path: p, signedURL: `/object/img/${bucket}/${p}?token=mock`, error: null })));
      }
      if (url.pathname.includes("/sign/review-videos/") && process.env.MOCK_VIDEO) {
        return send(res, 200, { signedURL: `/object/video/${url.pathname.split("/sign/")[1]}?token=mock` });
      }
      if (url.pathname.includes("/sign/")) return send(res, 200, { signedURL: "/missing.png" });
      if (url.pathname.startsWith("/storage/v1/object/video/")) return sampleVideo(req, res);
      if (url.pathname === "/storage/v1/bucket") return send(res, 200, [{ id: "thumbnails", name: "thumbnails", public: true }]);
      if (url.pathname.startsWith("/storage/v1/object/img/")) return sampleImage(res, decodeURIComponent(url.pathname));
      return send(res, 404, { error: "not found" });
    }
    const rpc = /^\/rest\/v1\/rpc\/([a-z0-9_]+)$/.exec(url.pathname);
    // The daily word's one-step guess (0079), on the remembered plays.
    if (rpc && rpc[1] === "daily_word_guess") {
      const b = body ? JSON.parse(body) : {};
      const rows = tableRows(F, "daily_word_plays");
      const now = new Date().toISOString();
      let row = rows.find((r) => r.user_id === b.p_user && r.day === b.p_day);
      if (!row) rows.push((row = { user_id: b.p_user, day: b.p_day, puzzle: b.p_puzzle, guesses: [], solved: false, finished_at: null, created_at: now, updated_at: now }));
      if (row.finished_at) return send(res, 200, [{ result: "over", guesses: row.guesses, solved: row.solved, finished: true }]);
      if (row.guesses.includes(b.p_word)) return send(res, 200, [{ result: "again", guesses: row.guesses, solved: row.solved, finished: false }]);
      row.guesses = [...row.guesses, b.p_word];
      row.solved = !!b.p_solved;
      const done = row.solved || row.guesses.length >= 6;
      row.finished_at = done ? now : null;
      row.updated_at = now;
      return send(res, 200, [{ result: "ok", guesses: row.guesses, solved: row.solved, finished: done }]);
    }
    if (rpc) {
      const v = F.rpc?.[rpc[1]];
      const out = typeof v === "function" ? v(body ? JSON.parse(body) : {}) : v ?? null;
      // An RPC fixture can answer like a raised exception: { __status: 400, __body: { code, message } }.
      if (out && typeof out === "object" && out.__status) return send(res, out.__status, out.__body);
      return send(res, 200, out);
    }
    const t = /^\/rest\/v1\/([a-z0-9_]+)$/.exec(url.pathname);
    if (t) {
      // Tables that remember writes (the daily word's plays, and any in MOCK_WRITES=a,b):
      // inserts are kept, updates change the rows they match.
      const writable = WRITABLE.has(t[1]);
      if (writable && req.method === "POST") {
        const rows = [].concat(body ? JSON.parse(body) : []).map((r) => ({ created_at: new Date().toISOString(), ...r }));
        tableRows(F, t[1]).push(...rows);
        return send(res, 201, rows);
      }
      if (writable && req.method === "PATCH") {
        const hit = applyFilters(tableRows(F, t[1]), url.searchParams);
        const patch = body ? JSON.parse(body) : {};
        for (const r of hit) Object.assign(r, patch);
        return send(res, 200, hit);
      }
      // An update answers with the rows it matched (like "update … returning").
      if (req.method === "PATCH") return send(res, 200, applyFilters(F.tables[t[1]] ?? [], url.searchParams));
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, req.method === "POST" ? 201 : 200, []);
      const table = t[1];
      if (!F.tables[table] && process.env.MOCK_LOG) console.log("   (no fixture for", table + ")");
      let rows = applyFilters(tableRows(F, table) ?? [], url.searchParams);
      const range = req.headers["range"];
      const total = rows.length;
      if (range) {
        const [a, b] = String(range).split("-").map(Number);
        rows = rows.slice(a, b + 1);
      }
      const headers = { "Content-Range": `0-${Math.max(0, rows.length - 1)}/${total}` };
      if (req.method === "HEAD") return send(res, 200, undefined, headers);
      const accept = String(req.headers["accept"] || "");
      if (accept.includes("vnd.pgrst.object")) {
        if (!rows.length) return send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "The result contains 0 rows", hint: null }, headers);
        return send(res, 200, rows[0], headers);
      }
      return send(res, 200, rows, headers);
    }
    return send(res, 404, { message: "mock: unknown " + url.pathname });
  }
}
server.listen(54321, "127.0.0.1", () => console.log("mock supabase on :54321"));
