// e2e-server.mjs —— 本地全流程自测/UAT 服务器
// 背景：本机 workerd 起不来（Cloudflare 本地模拟器崩溃），改用 Node 自带 SQLite
//       挂载同一份 Worker 代码，逻辑与线上一致。
// 用法：在 worker/ 目录下  node e2e-server.mjs
// 地址：http://localhost:8787   管理后台 /admin/  密码 dev123456（同 .dev.vars）
import http from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import worker from "./src/index.js";

const PORT = 8787;

mkdirSync(".wrangler", { recursive: true });
const db = new DatabaseSync(".wrangler/e2e.sqlite");
db.exec(readFileSync("schema.sql", "utf8"));

// ── 把 worker 里用到的 D1 接口适配到 node:sqlite ──
class Prep {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { this.args = a; return this; }
  all() { return { results: db.prepare(this.sql).all(...this.args) }; }
  first() { return db.prepare(this.sql).get(...this.args) ?? null; }
  run() {
    const info = db.prepare(this.sql).run(...this.args);
    return { meta: { changes: Number(info.changes) } };
  }
}
const env = {
  DB: { prepare: sql => new Prep(sql) },
  ADMIN_PASSWORD: "dev123456",
  SESSION_SECRET: "dev-secret-change-me",
};

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === "/admin") { res.writeHead(302, { location: "/admin/" }); return res.end(); }

    if (url.pathname.startsWith("/api/")) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const r = await worker.fetch(
        new Request(`http://localhost:${PORT}${url.pathname}${url.search}`, {
          method: req.method,
          headers: {
            "user-agent": req.headers["user-agent"] || "",
            "cookie": req.headers.cookie || "",
            "cf-connecting-ip": "127.0.0.1",
          },
          body,
        }),
        env
      );
      const headers = { "content-type": r.headers.get("content-type") || "application/json" };
      if (r.headers.get("set-cookie")) headers["set-cookie"] = r.headers.get("set-cookie");
      if (r.headers.get("content-disposition")) headers["content-disposition"] = r.headers.get("content-disposition");
      res.writeHead(r.status, headers);
      return res.end(Buffer.from(await r.arrayBuffer()));
    }

    // 静态资源（目录 → index.html；先读文件再写头，避免半途异常时头已发出）
    let p = decodeURIComponent(url.pathname);
    if (p === "/") p = "/index.html";
    let file = join("public", p);
    if (existsSync(file) && !extname(file)) file = join(file, "index.html");
    if (!existsSync(file)) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("not found"); }
    const data = readFileSync(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch (e) {
    console.error(e);
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: String(e) }));
  }
}).listen(PORT, () => {
  console.log(`e2e server → http://localhost:${PORT}`);
  console.log(`管理后台     → http://localhost:${PORT}/admin/  密码 dev123456`);
});
