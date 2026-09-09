import { PRIZES } from "./config.js";

const COOKIE_NAME = "dt_admin";
const TOTAL = PRIZES.reduce((s, p) => s + p.weight, 0);

// ────────────────────────── 工具 ──────────────────────────

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

const nowTs = () => Math.floor(Date.now() / 1000);

async function hmacSign(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// 管理会话：`过期时间戳.HMAC(过期时间戳)`，12 小时有效
async function makeToken(secret) {
  const exp = Date.now() + 12 * 3600 * 1000;
  return `${exp}.${await hmacSign(secret, String(exp))}`;
}

async function checkToken(token, secret) {
  if (!token) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || exp < Date.now() || !sig) return false;
  return (await hmacSign(secret, expStr)) === sig;
}

function getCookie(req, name) {
  const m = req.headers.get("Cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

function pickPrize() {
  let r = Math.random() * TOTAL;
  for (const p of PRIZES) if ((r -= p.weight) < 0) return p;
  return PRIZES[PRIZES.length - 1];
}

function genCode() {
  const a = Date.now().toString(36).toUpperCase().slice(-5);
  const b = Math.random().toString(36).toUpperCase().slice(2, 6).padEnd(4, "X");
  return ("DT" + a + b).replace(/[^A-Z0-9]/g, "X");
}

// ────────────────────────── 学员接口 ──────────────────────────

async function handleDraw(req, env) {
  let body;
  try { body = await req.json(); } catch { return json({ error: "参数错误" }, 400); }

  const nickname = String(body.nickname ?? "").trim().slice(0, 12);
  const phone = String(body.phone ?? "").trim();
  if (!nickname) return json({ error: "请先填写昵称" }, 400);
  if (!/^1[3-9]\d{9}$/.test(phone)) return json({ error: "请填写 11 位手机号" }, 400);

  const ip = req.headers.get("CF-Connecting-IP") || "local";

  // 同 IP 十分钟内最多 20 次，防脚本刷
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM draws WHERE ip = ? AND ts > ?"
  ).bind(ip, nowTs() - 600).first();
  if (recent.n >= 20) return json({ error: "操作太频繁啦，休息几秒再试" }, 429);

  const prize = pickPrize();
  const code = genCode();

  try {
    await env.DB.prepare(
      `INSERT INTO draws (nickname, phone, prize_level, reward, code, ts, ip, ua)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(nickname, phone, prize.level, prize.reward,
           code, nowTs(), ip, req.headers.get("User-Agent") || "").run();
    return json({
      already: false,
      result: { nickname, level: prize.level, emoji: prize.emoji, reward: prize.reward, code },
    });
  } catch (e) {
    // 手机号重复：返回第一次的结果，不给重抽（换昵称也没用；区分兑奖码意外撞码等其他冲突）
    if (!String(e).includes("draws.phone")) {
      console.error("draw insert failed:", e);
      return json({ error: "系统繁忙，请稍后再试" }, 500);
    }
    const row = await env.DB.prepare(
      "SELECT nickname, prize_level, reward, code FROM draws WHERE phone = ?"
    ).bind(phone).first();
    return json({
      already: true,
      result: { nickname: row.nickname, level: row.prize_level, emoji: "", reward: row.reward, code: row.code },
    });
  }
}

// ────────────────────────── 管理接口 ──────────────────────────

async function adminData(env) {
  const { results: rows } = await env.DB.prepare(
    "SELECT id, nickname, phone, prize_level, reward, code, ts, ip, redeemed FROM draws ORDER BY id DESC LIMIT 500"
  ).all();
  const { results: statsRows } = await env.DB.prepare(
    "SELECT prize_level, COUNT(*) AS n FROM draws GROUP BY prize_level"
  ).all();
  const totalRow = await env.DB.prepare(
    "SELECT COUNT(*) AS n, COALESCE(SUM(redeemed), 0) AS redeemed FROM draws"
  ).first();

  const byLevel = {};
  let total = 0;
  for (const r of statsRows) { byLevel[r.prize_level] = r.n; total += r.n; }
  return json({
    stats: { total, redeemed: totalRow.redeemed, byLevel },
    rows: rows.map(r => ({ ...r })),
  });
}

async function exportCsv(env) {
  const { results: rows } = await env.DB.prepare(
    "SELECT nickname, phone, prize_level, reward, code, ts, ip, redeemed FROM draws ORDER BY id ASC"
  ).all();
  const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["时间(+8)", "昵称", "手机号", "奖项", "奖品", "兑奖码", "是否核销", "IP"].map(esc).join(",")];
  for (const r of rows) {
    const time = new Date((r.ts + 8 * 3600) * 1000).toISOString().slice(0, 19).replace("T", " ");
    lines.push([time, r.nickname, r.phone, r.prize_level, r.reward, r.code,
                r.redeemed ? "已核销" : "未核销", r.ip].map(esc).join(","));
  }
  const stamp = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const BOM = String.fromCharCode(0xfeff); // Excel 中文表头兼容
  return new Response(BOM + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="lottery-${stamp}.csv"; filename*=UTF-8''${encodeURIComponent(`抽奖记录-${stamp}.csv`)}`,
    },
  });
}

// ────────────────────────── 路由 ──────────────────────────

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "GET" && path === "/api/health") return json({ ok: true, ts: nowTs() });

    if (req.method === "GET" && path === "/api/config") {
      // 概率不外发：只在服务端参与开奖
      return json({
        prizes: PRIZES.map(p => ({ level: p.level, emoji: p.emoji, reward: p.reward })),
      });
    }

    if (req.method === "POST" && path === "/api/draw") return handleDraw(req, env);

    // 管理端：/admin 由静态资源落到 public/admin/index.html
    if (req.method === "GET" && path === "/admin") return Response.redirect(url.origin + "/admin/", 302);

    if (req.method === "POST" && path === "/api/admin/login") {
      let body;
      try { body = await req.json(); } catch { return json({ error: "参数错误" }, 400); }
      if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET)
        return json({ error: "服务端未配置管理密码，请先 wrangler secret put" }, 500);
      if (String(body.password ?? "") !== env.ADMIN_PASSWORD) return json({ error: "密码不对" }, 401);
      const token = await makeToken(env.SESSION_SECRET);
      return json({ ok: true }, 200, {
        "set-cookie": `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`,
      });
    }

    if (path.startsWith("/api/admin/")) {
      if (!(await checkToken(getCookie(req, COOKIE_NAME), env.SESSION_SECRET)))
        return json({ error: "未登录" }, 401);

      if (req.method === "GET" && path === "/api/admin/data") return adminData(env);
      if (req.method === "GET" && path === "/api/admin/export.csv") return exportCsv(env);

      if (req.method === "POST" && path === "/api/admin/logout")
        return json({ ok: true }, 200, { "set-cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; Max-Age=0` });

      let body = {};
      try { body = await req.json(); } catch { /* 空体允许 */ }

      if (req.method === "POST" && path === "/api/admin/redeem") {
        const code = String(body.code ?? "").trim().toUpperCase();
        const redeemed = body.redeemed ? 1 : 0;
        if (!code) return json({ error: "缺少兑奖码" }, 400);
        const r = await env.DB.prepare(
          "UPDATE draws SET redeemed = ?, redeemed_at = ? WHERE code = ?"
        ).bind(redeemed, redeemed ? nowTs() : null, code).run();
        return r.meta.changes ? json({ ok: true }) : json({ error: "兑奖码不存在" }, 404);
      }

      if (req.method === "POST" && path === "/api/admin/delete") {
        const id = Number(body.id);
        if (!id) return json({ error: "缺少记录 ID" }, 400);
        await env.DB.prepare("DELETE FROM draws WHERE id = ?").bind(id).run();
        return json({ ok: true });
      }

      if (req.method === "POST" && path === "/api/admin/reset") {
        if (body.confirm !== "RESET") return json({ error: "缺少确认参数" }, 400);
        await env.DB.prepare("DELETE FROM draws").run();
        try { // 空表时 sqlite_sequence 可能尚不存在
          await env.DB.prepare("DELETE FROM sqlite_sequence WHERE name = 'draws'").run();
        } catch (e) {}
        return json({ ok: true });
      }
    }

    return json({ error: "not found" }, 404);
  },
};
