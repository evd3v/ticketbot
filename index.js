import axios from "axios";
import http from "http";
import https from "https";
import TeleBot from "telebot";
import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { load as cheerioLoad } from "cheerio";
import { collectGuestCookies, collectGuestHeaders } from "./lib/qtGuest.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_BOT_TOKEN) {
  console.error("[config.error] TELEGRAM_BOT_TOKEN is required");
  process.exit(1);
}

let guestAuthInflight = new Map();
const guestAuthByAlias = new Map();
function getGuestAuthHeaderForAlias(alias) {
  return guestAuthByAlias.get(String(alias)) || "";
}
async function ensureGuestAuthForSessionById(id, alias) {
  try {
    const key = String(alias || "");
    if (!key) return;
    if (guestAuthByAlias.has(key)) return;
    if (guestAuthInflight.has(key)) return await guestAuthInflight.get(key);
    const p = (async () => {
      try {
        console.log(`[auth.step] ensureGuestAuth start id=${id} alias=${alias}`);
        const cap = await collectGuestHeaders(String(alias), String(id), QT_USER_ID);
        if (cap?.setCookies && Array.isArray(cap.setCookies)) applySetCookie(cap.setCookies);
        if (cap?.authorization) {
          guestAuthByAlias.set(key, String(cap.authorization));
          console.log(`[auth.info] captured guest authorization for alias=${alias}`);
        }
      } catch (e) {
        console.log("[auth.warn] collectGuestHeaders failed:", e?.message || e);
      }
    })();
    guestAuthInflight.set(key, p);
    try {
      await p;
    } finally {
      guestAuthInflight.delete(key);
    }
  } catch {}
}

// Гостевая сессия: гарантировать наличие cookies (qt__auth и др.) для конкретного сеанса
let guestInflight = new Map();
async function ensureGuestCookiesForSessionById(id) {
  try {
    loadQtSession();
    const hasAuth = qtSession && qtSession.cookies && qtSession.cookies.qt__auth;
    if (hasAuth) return;
    const key = String(id);
    if (guestInflight.has(key)) return await guestInflight.get(key);
    const p = (async () => {
      const url = await getOrResolveSessionLink(id);
      if (!url) return;
      try {
        console.log(`[auth.step] ensureGuestCookies start id=${id}`);
        const setCookies = await collectGuestCookies(url);
        if (Array.isArray(setCookies) && setCookies.length) applySetCookie(setCookies);
        console.log(`[auth.step] ensureGuestCookies ok id=${id}`);
      } catch (e) {
        console.log("[auth.warn] collectGuestCookies failed:", e?.message || e);
      }
    })();
    guestInflight.set(key, p);
    try {
      await p;
    } finally {
      guestInflight.delete(key);
    }
  } catch {}
}

function parseAuthMap(s) {
  const obj = {};
  try {
    if (!s) return obj;
    let j = null;
    try {
      j = JSON.parse(s);
    } catch {}
    if (j && typeof j === "object") {
      for (const [k, v] of Object.entries(j)) if (v) obj[String(k)] = String(v);
      return obj;
    }
    const parts = String(s)
      .split(/[;,\n]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const part of parts) {
      const idx = part.indexOf("=");
      if (idx > 0) {
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        if (k && v) obj[k] = v;
      }
    }
    return obj;
  } catch {
    return obj;
  }
}

function getAuthForAlias(alias) {
  const MAP = parseAuthMap(QT_AUTH_MAP);
  const a = MAP && alias ? MAP[alias] : null;
  return a || QT_AUTH_B64 || DEFAULT_AUTH_B64;
}

const ADMIN_CHAT_ID = 875484579;
const ANGEL_CHAT_ID = 384686618;

const PORT = process.env.PORT || 10010; // internal, fronted by Nginx
const WEB_APP_URL = process.env.WEB_APP_URL || "http://localhost:10000/webapp"; // public via Nginx
const CAN_USE_WEB_APP = /^https:\/\//i.test(WEB_APP_URL);
const QT_USER_ID = process.env.QT_USER_ID || "1190633";
const QT_LOGIN_EMAIL = process.env.QT_LOGIN_EMAIL || "";
const QT_LOGIN_PASSWORD = process.env.QT_LOGIN_PASSWORD || "";
const QT_AUTH_B64 = process.env.QT_AUTH_B64 || "";
const QT_AUTH_MAP = process.env.QT_AUTH_MAP || "";
const DEFAULT_AUTH_B64 = "OTEwZGVlNmE1ZWM3OGY0YTg0ZDMxODQ0YzVjMTBhYmNhNmZlNDBiZTY1NDZiNmNkZDE2MTFkZWVkZTg1OWRmOQ==";
const HALL_CACHE_TTL_MS = Number(process.env.HALL_CACHE_TTL_MS || 30 * 60 * 1000);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 5000);

// Глобальные агенты для keep-alive и таймаутов HTTP(S)
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 32, maxFreeSockets: 16, timeout: 60_000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 32, maxFreeSockets: 16, timeout: 60_000 });
axios.defaults.httpAgent = httpAgent;
axios.defaults.httpsAgent = httpsAgent;
axios.defaults.timeout = Number(process.env.HTTP_TIMEOUT_MS || 7000);

function shq(s) {
  const str = String(s ?? "");
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

function maskVal(v) {
  const s = String(v || "");
  if (s.length <= 6) return "*".repeat(s.length || 3);
  return s.slice(0, 3) + "***" + s.slice(-2);
}

function maskCookie(c) {
  try {
    return String(c)
      .split(/;\s*/)
      .map((p) => {
        const idx = p.indexOf("=");
        if (idx < 0) return p;
        const n = p.slice(0, idx);
        const v = p.slice(idx + 1);
        return n + "=" + maskVal(v);
      })
      .join("; ");
  } catch {
    return String(c || "");
  }
}

function stripCookie(cookieHeader, names = []) {
  try {
    const set = new Set(names.map((x) => String(x).trim().toLowerCase()));
    const parts = String(cookieHeader || "")
      .split(/;\s*/)
      .filter(Boolean)
      .filter((p) => {
        const idx = p.indexOf("=");
        if (idx < 0) return false;
        const n = p.slice(0, idx).trim().toLowerCase();
        return !set.has(n);
      });
    return parts.join("; ");
  } catch {
    return String(cookieHeader || "");
  }
}

function buildCurl(method, url, params, headers, data, maskCookies) {
  const u = new URL(url);
  if (params && typeof params === "object") {
    for (const [k, v] of Object.entries(params)) {
      if (v == null) continue;
      u.searchParams.set(k, String(v));
    }
  }
  const parts = ["curl", "-sS", "-X", method.toUpperCase(), shq(u.toString())];
  if (headers && typeof headers === "object") {
    for (const [k, v] of Object.entries(headers)) {
      if (v == null) continue;
      let hv = String(v);
      const kl = k.toLowerCase();
      if (maskCookies && (kl === "cookie" || kl === "authorization")) hv = maskCookie(hv);
      parts.push("-H", shq(`${k}: ${hv}`));
    }
  }
  if (data != null) {
    let body = data;
    if (typeof data !== "string") body = new URLSearchParams(data).toString();
    parts.push("--data-raw", shq(body));
  }
  return parts.join(" ");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "https://quicktickets.ru";
const ORG_ALIASES = [
  "orel-teatr-svobodnoe-prostranstvo",
  "orel-teatr-kukol",
  'orel-teatr-turgeneva'
];

function getOrgAliasForSession(id) {
  try {
    const row = getSessionByIdStmt.get(String(id));
    if (row?.link) {
      try {
        const u = new URL(row.link);
        const parts = u.pathname.split("/").filter(Boolean);
        return parts[0] || ORG_ALIASES[0];
      } catch {}
    }
  } catch {}
  return null;
}

function buildQtHeaders(alias) {
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "ru,en-US;q=0.9,en;q=0.8,ru-RU;q=0.7",
    "api-id": "quick-tickets",
    authorization: "Basic " + getAuthForAlias(alias),
    "cache-control": "no-cache",
    origin: "https://hall.quicktickets.ru",
    pragma: "no-cache",
    priority: "u=1, i",
    referer: "https://hall.quicktickets.ru/",
    "sec-ch-ua":
      '\"Google Chrome\";v="141", \"Not?A_Brand\";v="8", \"Chromium\";v="141"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '\"macOS\"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  };
}

function buildQtParams(id, alias) {
  return {
    scope: "qt",
    panel: "site",
    user_id: QT_USER_ID,
    organisation_alias: alias,
    elem_type: "session",
    elem_id: id,
  };
}

async function requestQt(endpoint, id, alias, opts = {}) {
  const useCookies = !!opts.useCookies;
  const didRetry = !!opts.didRetry;
  const headers = { ...buildQtHeaders(alias) };
  console.log(`[qt.begin] ${endpoint} id=${id} alias=${alias} useCookies=${useCookies ? 'on' : 'off'}`);
  if (useCookies) {
    console.log(`[qt.auth] ensure guest cookies/auth id=${id} alias=${alias}`);
    await ensureGuestCookiesForSessionById(id);
    await ensureGuestAuthForSessionById(id, alias);
    const cookieHeader = getCookieHeader();
    if (cookieHeader) headers["cookie"] = cookieHeader;
    const ah = getGuestAuthHeaderForAlias(alias);
    if (ah) headers["authorization"] = ah;
    console.log(`[qt.headers] id=${id} alias=${alias} auth=${ah ? 'guest' : 'basic'} cookie=${cookieHeader ? 'on' : 'off'}`);
  }
  try {
    const params = buildQtParams(id, alias);
    const isHall = /\/hall\/hall(?:\?|$)/.test(endpoint);
    if (isHall) {
      const base = { ...params };
      let lastErr = null;
      let firstInvalidErr = null;
      const variants = [
        // Браузерный профиль с cookies и Authorization (требуется API)
        { apiId: "quick-tickets", panel: "site", scope: base.scope, withUserId: true, withAuth: true, dropQtAuth: false },
        // На случай конфликтов с qt__auth в cookie
        { apiId: "quick-tickets", panel: "site", scope: base.scope, withUserId: true, withAuth: true, dropQtAuth: true  },
        // Без cookies (как крайняя попытка)
        { apiId: "quick-tickets", panel: "site", scope: base.scope, withUserId: true, withAuth: true, withCookies: false },
        // Фоллбэки по user_id: убрать параметр вовсе
        { apiId: "quick-tickets", panel: "site", scope: base.scope, withUserId: false, withAuth: true, dropQtAuth: false },
        // user_id=0 (иногда сервер принимает как гостя)
        { apiId: "quick-tickets", panel: "site", scope: base.scope, withUserId: "zero", withAuth: true, dropQtAuth: true },
      ];
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        const p2 = { ...base, scope: v.scope, panel: v.panel };
        if (v.withUserId === false) delete p2.user_id;
        if (v.withUserId === "zero") p2.user_id = 0;
        const h2 = { ...headers, "api-id": v.apiId };
        h2["sec-fetch-site"] = "same-site";
        if (!v.withAuth) delete h2.authorization;
        if (Object.prototype.hasOwnProperty.call(v, "withCookies") && v.withCookies === false) {
          delete h2.cookie;
        }
        if (h2.cookie && v.dropQtAuth) h2.cookie = stripCookie(h2.cookie, ["qt__auth"]);
        const uid = (v.withUserId === false) ? "none" : (v.withUserId === "zero" ? 0 : p2.user_id);
        const useAuth = (v.withAuth !== false) ? "on" : "off";
        const useCookies = (Object.prototype.hasOwnProperty.call(v, "withCookies") && v.withCookies === false) ? "off" : "on";
        const dropAuth = v.dropQtAuth ? "on" : "off";
        console.log(`[qt.variant] hall ${i + 1}/${variants.length} id=${id} alias=${alias} user_id=${uid} auth=${useAuth} cookies=${useCookies} dropQtAuth=${dropAuth}`);
        try {
          const r2 = await axios.get(endpoint, { params: p2, headers: h2 });
          if (r2?.headers?.["set-cookie"]) applySetCookie(r2.headers["set-cookie"]);
          console.log(`[qt.resp] hall ok variant=${i + 1} status=${r2.status}`);
          return r2.data;
        } catch (err2) {
          lastErr = err2;
          const t2 = err2?.response?.data?.error?.type;
          if (t2 === "invalid_token") {
            if (!firstInvalidErr) firstInvalidErr = err2;
            console.log(`[qt.warn] hall variant=${i + 1} invalid_token → next`);
            continue;
          }
          console.log(`[qt.warn] hall variant=${i + 1} failed: ${t2 || err2?.response?.status}`);
          continue;
        }
      }
      if (firstInvalidErr) throw firstInvalidErr;
      if (lastErr) throw lastErr; // не делаем "generic" попытку для hall/hall
    }
    console.log(`[qt.req] ${endpoint} id=${id} alias=${alias} useCookies=${useCookies ? 'on' : 'off'}`);
    const response = await axios.get(endpoint, { params, headers });
    if (response?.headers?.["set-cookie"]) applySetCookie(response.headers["set-cookie"]);
    console.log(`[qt.resp] ok ${endpoint} status=${response.status}`);
    return response.data;
  } catch (e) {
    const type = e?.response?.data?.error?.type;
    const status = e?.response?.status;
    if ((status === 401 || type === "authorization_header_is_required") && !didRetry) {
      console.log(`[qt.retry] ${endpoint} id=${id} alias=${alias} reason=auth_required → refresh guest auth`);
      try {
        if (useCookies) {
          await ensureGuestCookiesForSessionById(id);
          await ensureGuestAuthForSessionById(id, alias);
        } else {
          await ensureQtSession(true);
        }
      } catch {}
      return await requestQt(endpoint, id, alias, { ...opts, didRetry: true });
    }
    if (status === 404 && (type === "session_not_found" || type === "not_found")) {
      const fixed = await resolveSessionLink(id);
      if (fixed && fixed.alias && fixed.alias !== alias) {
        return await requestQt(endpoint, id, fixed.alias, opts);
      }
    }
    throw e;
  }
}

async function qtBootstrap() {
  const headers = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "ru,en-US;q=0.9,en;q=0.8,ru-RU;q=0.7",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  };
  const cookie = getCookieHeader();
  if (cookie) headers["cookie"] = cookie;
  try {
    console.log(`[auth.step] bootstrap start GET /`);
    const r = await axios.get("https://quicktickets.ru/", {
      headers,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    if (r?.headers?.["set-cookie"]) applySetCookie(r.headers["set-cookie"]);
    console.log(`[auth.step] bootstrap ok status=${r.status}`);
  } catch {}
}

async function resolveSessionLink(id) {
  try {
    const row = getSessionByIdStmt.get(String(id));
    if (row?.link) {
      const u = new URL(row.link);
      const alias = u.pathname.split("/").filter(Boolean)[0];
      return { alias, url: row.link };
    }
  } catch {}
  for (const alias of ORG_ALIASES) {
    const url = `${BASE_URL}/${alias}/s${id}`;
    try {
      const r = await axios.get(url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
          "accept-language": "ru-RU,ru;q=0.9,en;q=0.8",
        },
        validateStatus: (s) => s >= 200 && s < 500,
      });
      if (r.status === 200) {
        upsertSessionStmt.run({
          id: String(id),
          title: null,
          date_text: null,
          link: url,
        });
        return { alias, url };
      }
    } catch {}
  }
  return null;
}

async function getOrResolveSessionLink(id) {
  const row = getSessionByIdStmt.get(String(id));
  if (row?.link) return row.link;
  const r = await resolveSessionLink(id);
  return r?.url || null;
}

let qtSession = { cookies: {}, ts: 0 };

const hallCache = new Map();

function getSessionPath() {
  return path.join(__dirname, "data", "qt_session.json");
}

function loadQtSession() {
  try {
    const p = getSessionPath();
    const txt = fs.readFileSync(p, "utf8");
    const json = JSON.parse(txt);
    if (json && typeof json === "object") qtSession = json;
  } catch {}
}

function saveQtSession() {
  try {
    const p = getSessionPath();
    fs.writeFileSync(p, JSON.stringify(qtSession));
  } catch {}
}

function applySetCookie(arr) {
  if (!Array.isArray(arr)) return;
  for (const line of arr) {
    if (!line) continue;
    const first = String(line).split(";")[0];
    const idx = first.indexOf("=");
    if (idx <= 0) continue;
    const name = first.slice(0, idx).trim();
    const value = first.slice(idx + 1).trim();
    if (value) qtSession.cookies[name] = value;
    else delete qtSession.cookies[name];
  }
  qtSession.ts = Date.now();
  saveQtSession();
}

function getCookieHeader() {
  try {
    const parts = Object.entries(qtSession.cookies || {})
      .filter(([k, v]) => k && v)
      .map(([k, v]) => `${k}=${v}`);
    return parts.length ? parts.join("; ") : "";
  } catch {
    return "";
  }
}

let loginInFlight = null;

async function ensureQtSession(force) {
  loadQtSession();
  const hasAuth = qtSession && qtSession.cookies && qtSession.cookies.qt__auth;
  if (!force && hasAuth) return;
  if (loginInFlight) return loginInFlight;
  loginInFlight = (async () => {
    await qtBootstrap();
    if (!QT_LOGIN_EMAIL || !QT_LOGIN_PASSWORD) {
      console.log("[auth.warn] QT_LOGIN_EMAIL/QT_LOGIN_PASSWORD not set; cannot login");
      return;
    }
    await qtLogin();
  })();
  try {
    await loginInFlight;
  } finally {
    loginInFlight = null;
  }
}

async function qtLogin() {
  if (!QT_LOGIN_EMAIL || !QT_LOGIN_PASSWORD) return;
  const body = new URLSearchParams();
  body.set("email", QT_LOGIN_EMAIL);
  body.set("password", QT_LOGIN_PASSWORD);
  const headers = {
    accept: "*/*",
    "accept-language": "ru,en-US;q=0.9,en;q=0.8,ru-RU;q=0.7",
    "cache-control": "no-cache",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    origin: "https://quicktickets.ru",
    pragma: "no-cache",
    priority: "u=1, i",
    referer: "https://quicktickets.ru/",
    "sec-ch-ua":
      '\"Google Chrome\";v="141", \"Not?A_Brand\";v="8", \"Chromium\";v="141"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '\"macOS\"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    "x-requested-with": "XMLHttpRequest",
  };
  const cookie = getCookieHeader();
  if (cookie) headers["cookie"] = cookie;
  try {
    console.log(`[auth.step] login start`);
    const res = await axios.post("https://quicktickets.ru/user/login", body, {
      headers,
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    const setCookie = res.headers?.["set-cookie"];
    applySetCookie(setCookie);
    const keys = Object.keys(qtSession.cookies || {});
    console.log(`[auth.info] login ok, cookies: ${keys.join(', ')}`);
  } catch (e) {
    const st = e?.response?.status;
    console.log("[auth.error] login failed:", st || e?.message || e);
  }
}

async function fetchQtDataWithAlias(endpoint, id, opts = {}) {
  let alias = getOrgAliasForSession(id);
  if (!alias) {
    const fixed = await resolveSessionLink(id);
    if (!fixed || !fixed.alias) {
      const err = new Error("ORG_ALIAS_UNKNOWN");
      err.code = "ORG_ALIAS_UNKNOWN";
      throw err;
    }
    alias = fixed.alias;
  }
  return await requestQt(endpoint, id, alias, opts);
}

const getPlaces = async (id) => {
  try {
    const data = await fetchQtDataWithAlias(
      "https://api.quicktickets.ru/v1/anyticket/anyticket",
      id,
      { useCookies: true }
    );
    return data;
  } catch (e) {
    console.log("[http.error] getPlaces:", e?.response?.data || e?.message || e);
    throw e;
  }
};

const getHallData = async (id) => {
  const key = String(id);
  const now = Date.now();
  const cached = hallCache.get(key);
  if (cached && now - cached.ts < HALL_CACHE_TTL_MS) return cached.data;
  try {
    const data = await fetchQtDataWithAlias(
      "https://api.quicktickets.ru/v1/hall/hall",
      id,
      { useCookies: true }
    );
    hallCache.set(key, { ts: Date.now(), data });
    return data;
  } catch (e) {
    console.log("[http.error] getHallData:", e?.response?.data || e?.message || e);
    throw e;
  }
};

async function ensurePollingMode() {
  try {
    const res = await axios.get(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`,
      { params: { drop_pending_updates: true } }
    );
    if (!res?.data?.ok) {
      console.log("[bot.warn] deleteWebhook returned non-ok:", res?.data);
    } else {
      console.log(
        "[bot.info] Webhook deleted (if existed). Using getUpdates polling."
      );
    }
  } catch (e) {
    console.log(
      "[bot.error] Failed to delete webhook:",
      e?.response?.data || e.message
    );
  }
}

await ensurePollingMode();

const bot = new TeleBot({
  token: TELEGRAM_BOT_TOKEN, // Required. Telegram Bot API token.
});

// Unsubscribe from all (button text or command)
function clearAllSubscriptions(userId) {
  try {
    deleteUserSubsStmt.run(userId);
    db.prepare("DELETE FROM notify_state WHERE user_id = ?").run(userId);
    return true;
  } catch (e) {
    console.log("[db.error] clearAllSubscriptions:", e?.message || e);
    return false;
  }
}

function replyUnsubKeyboard() {
  return {
    keyboard: [[{ text: "Отписаться от всех" }]],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}
// ---------------------------
// SQLite store
// ---------------------------
const DATA_DIR = path.join(__dirname, "data");
await fs.promises.mkdir(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "ticketbot.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  date_text TEXT,
  link TEXT
);
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  PRIMARY KEY (user_id, session_id)
);
CREATE TABLE IF NOT EXISTS notify_state (
  user_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  last_count INTEGER,
  PRIMARY KEY (user_id, session_id)
);
`);

const upsertUser = db.prepare(`
  INSERT INTO users (id, username, first_name, last_name)
  VALUES (@id, @username, @first_name, @last_name)
  ON CONFLICT(id) DO UPDATE SET
    username=excluded.username,
    first_name=excluded.first_name,
    last_name=excluded.last_name
`);

const upsertSessionStmt = db.prepare(`
  INSERT INTO sessions (id, title, date_text, link)
  VALUES (@id, @title, @date_text, @link)
  ON CONFLICT(id) DO UPDATE SET
    title=excluded.title,
    date_text=excluded.date_text,
    link=excluded.link
`);

const deleteUserSubsStmt = db.prepare(
  `DELETE FROM subscriptions WHERE user_id = ?`
);
const insertUserSubStmt = db.prepare(
  `INSERT OR IGNORE INTO subscriptions (user_id, session_id) VALUES (?, ?)`
);
const getUserSubsStmt = db.prepare(
  `SELECT session_id FROM subscriptions WHERE user_id = ?`
);
const getAllSubscribedSessionIdsStmt = db.prepare(
  `SELECT DISTINCT session_id FROM subscriptions`
);
const getSessionByIdStmt = db.prepare(
  `SELECT id, title, date_text, link FROM sessions WHERE id = ?`
);
const getSubscribersForSessionStmt = db.prepare(
  `SELECT user_id FROM subscriptions WHERE session_id = ?`
);
const getUserNotifyStateStmt = db.prepare(
  `SELECT last_count FROM notify_state WHERE user_id = ? AND session_id = ?`
);
const upsertNotifyStateStmt = db.prepare(`
  INSERT INTO notify_state (user_id, session_id, last_count) VALUES (?, ?, ?)
  ON CONFLICT(user_id, session_id) DO UPDATE SET last_count=excluded.last_count
`);

// ---------------------------
// Telegram WebApp initData verification
// ---------------------------
const verifyInitData = (initData) => {
  try {
    if (!initData || typeof initData !== "string") return null;
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");

    const dataCheckArr = [];
    for (const [key, value] of params) dataCheckArr.push(`${key}=${value}`);
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join("\n");

    // Secret key for WebApp verification = HMAC_SHA256("WebAppData", bot_token)
    const secret = crypto
      .createHmac("sha256", "WebAppData")
      .update(TELEGRAM_BOT_TOKEN)
      .digest();
    const hmac = crypto
      .createHmac("sha256", secret)
      .update(dataCheckString)
      .digest("hex");

    if (hmac !== hash) return null;

    const userJson = params.get("user");
    if (!userJson) return null;
    const user = JSON.parse(userJson);
    if (!user?.id) return null;
    return user; // { id, ... }
  } catch (e) {
    console.log("[auth.error] verifyInitData:", e?.message || e);
    return null;
  }
};

// ---------------------------
// Scraping sessions from website with caching
// ---------------------------
let sessionsCache = { ts: 0, list: [] };
const SESSIONS_TTL_MS = 60 * 1000; // 1 minute
const SCRAPE_TIMEOUT_MS = 4000; // timeout for scraping quicktickets.ru pages
const SESSIONS_TIME_BUDGET_MS = 2500; // overall time budget for /api/sessions

const scrapeSessions = async () => {
  const combined = [];
  for (const alias of ORG_ALIASES) {
    const url = `${BASE_URL}/${alias}`;
    try {
      const res = await axios.get(url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
          "accept-language": "ru-RU,ru;q=0.9,en;q=0.8",
        },
        timeout: SCRAPE_TIMEOUT_MS,
      });
      const $ = cheerioLoad(res.data);
      const found = new Map();
      $(".elem[data-elem-type='event']").each((_, el) => {
        const $el = $(el);
        const title =
          $el.find("h3 .underline").first().text().trim() ||
          $el.find("h3").text().trim();
        $el.find(".sessions .session-column a[href*='/s']").each((__, a) => {
          const $a = $(a);
          const href = $a.attr("href") || "";
          const m = href.match(/\/s(\d+)/);
          if (!m) return;
          const id = m[1];
          const dateText = $a.find(".underline").text().trim() || $a.text().trim();
          const link = new URL(href, BASE_URL).toString();
          if (!found.has(id)) {
            found.set(id, { id, title, date: dateText, link });
          }
        });
      });
      combined.push(...found.values());
    } catch (e) {
      console.log("[scrape.warn] alias", alias, e?.message || e);
      continue;
    }
  }
  return combined;
};

const getSessionsList = async () => {
  const now = Date.now();
  if (sessionsCache.list.length && now - sessionsCache.ts < SESSIONS_TTL_MS) {
    return sessionsCache.list;
  }
  try {
    const list = await Promise.race([
      scrapeSessions(),
      new Promise((resolve) => setTimeout(() => resolve(null), SESSIONS_TIME_BUDGET_MS)),
    ]);
    if (!Array.isArray(list)) {
      const rows = db
        .prepare("SELECT id, title, date_text as date, link FROM sessions")
        .all();
      return rows;
    }
    sessionsCache = { ts: now, list };
    // persist to DB
    const insertMany = db.transaction((items) => {
      for (const s of items) {
        upsertSessionStmt.run({
          id: s.id,
          title: s.title,
          date_text: s.date,
          link: s.link,
        });
      }
    });
    insertMany(list);
    return list;
  } catch (e) {
    console.log("[scrape.error]", e?.message || e);
    // fallback to DB sessions if cache empty
    const rows = db
      .prepare("SELECT id, title, date_text as date, link FROM sessions")
      .all();
    return rows;
  }
};

// ---------------------------
// Express server: static webapp + APIs
// ---------------------------
const app = express();
app.use(express.json());
app.use("/webapp", express.static(path.join(__dirname, "webapp")));

// Serve Mini App index for /webapp without trailing slash
app.get("/webapp", (req, res) => {
  res.sendFile(path.join(__dirname, "webapp", "index.html"));
});

// Serve Mini App index for /webapp/ (with trailing slash)
app.get("/webapp/", (req, res) => {
  res.sendFile(path.join(__dirname, "webapp", "index.html"));
});

app.get("/api/sessions", async (req, res) => {
  const user = verifyInitData(req.query.initData);
  const list = await getSessionsList();
  let set = new Set();
  if (user) {
    try {
      upsertUser.run({
        id: user.id,
        username: user.username || null,
        first_name: user.first_name || null,
        last_name: user.last_name || null,
      });
      const rows = getUserSubsStmt.all(user.id);
      set = new Set(rows.map((r) => String(r.session_id)));
    } catch (e) {
      console.log("[db.error] upsertUser:", e?.message || e);
    }
  } else {
    console.log("[api.warn] /api/sessions: INVALID_INIT_DATA (public list mode)");
  }
  const payload = list
    .map((s) => ({
      id: s.id,
      title: s.title,
      date: s.date,
      link: s.link,
      subscribed: set.has(String(s.id)),
    }))
    .sort((a, b) => Number(b.subscribed) - Number(a.subscribed));
  return res.json({ ok: true, sessions: payload });
});

app.post("/api/subscriptions", async (req, res) => {
  const user = verifyInitData(req.query.initData);
  if (!user)
    return res.status(403).json({ ok: false, error: "INVALID_INIT_DATA" });
  const { subscriptions: subs } = req.body || {};
  if (!Array.isArray(subs)) {
    return res
      .status(400)
      .json({ ok: false, error: "SUBSCRIPTIONS_ARRAY_REQUIRED" });
  }
  try {
    upsertUser.run({
      id: user.id,
      username: user.username || null,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
    });
    const norm = subs.map((x) => String(x));
    // compute diff before writing
    const prevRows = getUserSubsStmt.all(user.id);
    const prevSet = new Set(prevRows.map((r) => String(r.session_id)));
    const nextSet = new Set(norm);
    const added = [...nextSet].filter((id) => !prevSet.has(id));
    const removed = [...prevSet].filter((id) => !nextSet.has(id));
    // ensure sessions exist with minimal info
    const ensure = db.transaction((ids) => {
      for (const id of ids) {
        const existing = getSessionByIdStmt.get(id);
        if (!existing) {
          upsertSessionStmt.run({
            id,
            title: null,
            date_text: null,
            link: null,
          });
        }
      }
    });
    ensure(norm);

    const tx = db.transaction((userId, ids) => {
      deleteUserSubsStmt.run(userId);
      for (const id of ids) insertUserSubStmt.run(userId, id);
    });
    tx(user.id, norm);
    // update notify_state silently (no user messages)
    if (added.length) {
      for (const sid of added) {
        try {
          const {
            response: { places: hallPlaces },
          } = await getHallData(sid);
          const {
            response: { places },
          } = await getPlaces(sid);
          const placesKeys = Object.keys(places);
          const hallPlacesKeys = Object.keys(hallPlaces);
          const availablePlacesKeys = hallPlacesKeys.filter((key) => !placesKeys.includes(key));
          const availableCount = availablePlacesKeys.length;
          upsertNotifyStateStmt.run(user.id, String(sid), availableCount);
        } catch (e) {
          // ignore snapshot errors
        }
      }
    }
    if (removed.length) {
      try {
        const delStmt = db.prepare("DELETE FROM notify_state WHERE user_id = ? AND session_id = ?");
        for (const sid of removed) delStmt.run(user.id, String(sid));
      } catch {}
    }
    return res.json({ ok: true });
  } catch (e) {
    console.log("[db.error] save subs:", e?.message || e);
    return res.status(500).json({ ok: false, error: "DB_ERROR" });
  }
});

app.get("/", (req, res) => res.send("OK"));

app.listen(PORT, () => {
  console.log(`[server.info] Listening on :${PORT}`);
  console.log(`[server.info] WebApp URL: ${WEB_APP_URL}`);
});

// Configure Telegram chat menu button to open the Mini App for all users
async function setDefaultMenuButton() {
  if (!CAN_USE_WEB_APP) {
    console.log(
      "[bot.info] Skipping setChatMenuButton: WEB_APP_URL is not https, web_app buttons require HTTPS and domain set in BotFather."
    );
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setChatMenuButton`;
    const payload = {
      menu_button: {
        type: "web_app",
        text: "Открыть мини‑приложение",
        web_app: { url: WEB_APP_URL },
      },
    };
    const r = await axios.post(url, payload, {
      headers: { "content-type": "application/json" },
    });
    if (!r?.data?.ok) {
      console.log("[bot.warn] setChatMenuButton non-ok:", r?.data);
    } else {
      console.log("[bot.info] Chat menu button configured for WebApp");
    }
  } catch (e) {
    console.log("[bot.error] setChatMenuButton:", e?.message || e);
  }
}

setDefaultMenuButton();

// ---------------------------
// Bot commands: open WebApp
// ---------------------------
const webAppKeyboard = () => ({
  inline_keyboard: [
    [
      CAN_USE_WEB_APP
        ? { text: "Открыть мини‑приложение", web_app: { url: WEB_APP_URL } }
        : { text: "Открыть мини‑приложение", url: WEB_APP_URL },
    ],
  ],
});

const replyWebAppKeyboard = () => ({
  keyboard: [
    [
      {
        text: "Открыть мини‑приложение",
        web_app: { url: WEB_APP_URL },
      },
    ],
  ],
  resize_keyboard: true,
  one_time_keyboard: false,
});

function safeSendMessage(chatId, text, options = {}) {
  return bot
    .sendMessage(chatId, text, options)
    .catch((e) =>
      console.log("[bot.error] sendMessage:", e?.response?.data || e?.message || e)
    );
}

function sendIntro(chatId) {
  const text = [
    `<b>🎭 Театр «Свободное пространство» — уведомления о билетах</b>`,
    ``,
    `<b>Как пользоваться</b>`,
    `• Откройте мини‑приложение и отметьте нужные спектакли и сеансы.`,
    `• Подписки сохраняются <i>автоматически</i>.`,
    `• Я проверяю наличие каждые 5 секунд и присылаю уведомления <i>только при изменении</i> количества мест.`,
    `• В уведомлении укажу зону (Партер/Балкон), ряд и место.`,
    ``,
    `<b>Где открыть мини‑приложение</b>`,
    `• <b>В профиле бота</b>: нажмите на имя бота вверху чата → откроется профиль. Там будет раздел «Приложение»/«Apps» — нажмите, чтобы запустить.`,
  ].join("\n");
  const options = { parseMode: "HTML" }; // без кнопок
  safeSendMessage(chatId, text, options);
}

function isCmd(text = "", cmd) {
  // Matches /cmd, /cmd@BotName and optional arguments after a space
  const re = new RegExp(`^\\/${cmd}(?:@\\w+)?(?:\\s|$)`, "i");
  return re.test(text);
}

// Explicit command handlers (TeleBot supports this form)
bot.on("/start", (msg) => {
  const chatId = msg.from?.id || msg.chat?.id;
  console.log(`[bot.info] /start (command) from ${chatId}`);
  if (chatId) sendIntro(chatId);
});

bot.on("/help", (msg) => {
  const chatId = msg.from?.id || msg.chat?.id;
  console.log(`[bot.info] /help (command) from ${chatId}`);
  if (chatId) sendIntro(chatId);
});

bot.on("/manage", (msg) => {
  const chatId = msg.from?.id || msg.chat?.id;
  console.log(`[bot.info] /manage (command) from ${chatId}`);
  if (chatId) {
    safeSendMessage(
      chatId,
      `Чтобы открыть мини‑приложение: откройте профиль бота (нажмите на имя бота вверху чата) → раздел «Приложение»/«Apps».`,
      { parseMode: "HTML" }
    );
  }
});

bot.on("/subscription", (msg) => {
  const chatId = msg.from?.id || msg.chat?.id;
  if (!chatId) return;
  try {
    const rows = getUserSubsStmt.all(chatId);
    if (!rows.length) {
      return safeSendMessage(chatId, "Пока нет активных подписок.", { replyMarkup: replyUnsubKeyboard() });
    }
    const items = rows
      .map((r) => getSessionByIdStmt.get(String(r.session_id)))
      .filter(Boolean)
      .sort((a, b) => dateSortKeyRU(a.date_text || a.date || "") - dateSortKeyRU(b.date_text || b.date || ""));
    const lines = items.map((s) => `• <b>${(s.title || "Сеанс").replace(/</g, '&lt;').replace(/>/g, '&gt;')}</b> — ${(s.date_text || s.date || "").replace(/</g, '&lt;').replace(/>/g, '&gt;')}`);
    const text = [
      `<b>Ваши подписки (${lines.length})</b>`,
      ...lines,
    ].join("\n");
    return safeSendMessage(chatId, text, { parseMode: "HTML", replyMarkup: replyUnsubKeyboard() });
  } catch (e) {
    console.log("[cmd.error] /subscription:", e?.message || e);
    return safeSendMessage(chatId, "Не удалось получить список подписок.");
  }
});

bot.on("/unsubscribe_all", (msg) => {
  const chatId = msg.from?.id || msg.chat?.id;
  if (!chatId) return;
  const ok = clearAllSubscriptions(chatId);
  safeSendMessage(chatId, ok ? "Все подписки сняты." : "Не удалось снять подписки, попробуйте позже.");
});

bot.on("/unsuball", (msg) => {
  const chatId = msg.from?.id || msg.chat?.id;
  if (!chatId) return;
  const ok = clearAllSubscriptions(chatId);
  safeSendMessage(chatId, ok ? "Все подписки сняты." : "Не удалось снять подписки, попробуйте позже.");
});

bot.on("/unsub", (msg) => {
  const chatId = msg.from?.id || msg.chat?.id;
  if (!chatId) return;
  const ok = clearAllSubscriptions(chatId);
  safeSendMessage(chatId, ok ? "Все подписки сняты." : "Не удалось снять подписки, попробуйте позже.");
});

bot.on("text", (msg) => {
  try {
    const chatId = msg.from?.id || msg.chat?.id;
    const text = msg.text || "";
    if (!chatId) return;
    // Avoid double handling: explicit /command handlers are already set
    if (/^\//.test(text)) return;

    if (isCmd(text, "start") || isCmd(text, "help")) {
      console.log(`[bot.info] Received /start or /help from ${chatId}`);
      return sendIntro(chatId);
    }
    if (isCmd(text, "manage")) {
      console.log(`[bot.info] Received /manage from ${chatId}`);
      return safeSendMessage(chatId, `Чтобы открыть мини‑приложение: откройте профиль бота (нажмите на имя бота вверху чата) → раздел «Приложение»/«Apps».`, { parseMode: "HTML" });
    }
    if (/^отписаться от всех$/i.test(text.trim())) {
      const ok = clearAllSubscriptions(chatId);
      return safeSendMessage(chatId, ok ? "Все подписки сняты." : "Не удалось снять подписки, попробуйте позже.");
    }
  } catch (e) {
    console.log("[bot.error] text handler:", e?.message || e);
  }
});

// Track last availability per session to send notifications only on change
const lastAvailability = new Map(); // sessionId -> number

// Helper: derive row/seat numbers from hall place coordinates
function buildSeatIndex(hallPlaces) {
  const tryParsePx = (v) => {
    if (v == null) return undefined;
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const m = v.match(/-?\d+(?:\.\d+)?/);
      return m ? parseFloat(m[0]) : undefined;
    }
    if (typeof v === "object") {
      // try common shapes
      return tryParsePx(v.left ?? v.x ?? v.pos?.x ?? v.params?.left);
    }
    return undefined;
  };

  // Collect places with coordinates
  const places = [];
  for (const [pid, obj] of Object.entries(hallPlaces || {})) {
    const left = tryParsePx(
      obj?.left ??
        obj?.style?.left ??
        obj?.x ??
        obj?.pos?.x ??
        obj?.params?.left
    );
    const top = tryParsePx(
      obj?.top ?? obj?.style?.top ?? obj?.y ?? obj?.pos?.y ?? obj?.params?.top
    );
    if (left == null || top == null) continue;
    places.push({ id: pid, left, top });
  }
  if (!places.length) return new Map();

  // Group by rows using vertical proximity
  places.sort((a, b) => a.top - b.top || a.left - b.left);
  const ROW_EPS = 6; // px tolerance to group into the same row
  const rows = [];
  for (const p of places) {
    const row = rows.find((r) => Math.abs(r.refTop - p.top) <= ROW_EPS);
    if (row) row.items.push(p);
    else rows.push({ refTop: p.top, items: [p] });
  }
  // Sort rows top-to-bottom and assign row numbers 1..N
  rows.sort((a, b) => a.refTop - b.refTop);
  const index = new Map();
  rows.forEach((row, i) => {
    // sort seats by left
    row.items.sort((a, b) => a.left - b.left);
    row.items.forEach((p, j) => {
      const rowNum = i + 1;
      // Number seats from the right: rightmost seat is 1
      const seatNum = row.items.length - j;
      let zone, rowDisp;
      if (rowNum <= 15) {
        zone = "Партер";
        rowDisp = rowNum; // 1..15
      } else if (rowNum <= 21) {
        zone = "Балкон";
        rowDisp = rowNum - 15; // 1..6
      } else {
        zone = "Зал";
        rowDisp = rowNum - 21; // start from 1 beyond balcony
      }
      index.set(p.id, { row: rowDisp, seat: seatNum, zone });
    });
  });
  return index;
}

function zoneOrder(z) {
  return z === "Партер" ? 0 : z === "Балкон" ? 1 : 2;
}

// RU month parser for sorting date_text like "05 октября 18:00"
const RU_MONTHS = {
  январ: 1,
  феврал: 2,
  март: 3,
  апрел: 4,
  мая: 5,
  июн: 6,
  июл: 7,
  август: 8,
  сентябр: 9,
  октябр: 10,
  ноябр: 11,
  декабр: 12,
};
function dateSortKeyRU(text = "") {
  // Extracts dd, month(word), HH:MM
  const m = text
    .toLowerCase()
    .match(/(\d{1,2})\s+([а-яё]+)\s+(\d{1,2}):(\d{2})/i);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const d = parseInt(m[1], 10);
  const monWord = m[2];
  const h = parseInt(m[3], 10);
  const mm = parseInt(m[4], 10);
  const monKey = Object.keys(RU_MONTHS).find((k) => monWord.startsWith(k));
  const mon = monKey ? RU_MONTHS[monKey] : 12;
  // Build comparable number: MMDDHHMM
  return mon * 1000000 + d * 10000 + h * 100 + mm;
}

setInterval(async () => {
  try {
    const sessionRows = getAllSubscribedSessionIdsStmt.all();
    const sessionIds = sessionRows.map((r) => String(r.session_id));
    for (const sid of sessionIds) {
      try {
        const {
          response: { places: hallPlaces },
        } = await getHallData(sid);
        const {
          response: { places },
        } = await getPlaces(sid);
        const placesKeys = Object.keys(places);
        const hallPlacesKeys = Object.keys(hallPlaces);
        const availablePlacesKeys = hallPlacesKeys.filter(
          (key) => !placesKeys.includes(key)
        );
        const availableCount = availablePlacesKeys.length;

        const prevGlobal = lastAvailability.get(sid);
        const changedGlobally =
          prevGlobal === undefined || prevGlobal !== availableCount;
        if (!changedGlobally) continue;

        let sessionInfo = getSessionByIdStmt.get(sid) || {
          id: sid,
          title: "Сеанс",
          date_text: "",
          link: null,
        };
        try {
          const fixedLink = await getOrResolveSessionLink(sid);
          if (fixedLink && sessionInfo.link !== fixedLink) {
            upsertSessionStmt.run({
              id: String(sid),
              title: sessionInfo.title || null,
              date_text: sessionInfo.date_text || null,
              link: fixedLink,
            });
            sessionInfo = { ...sessionInfo, link: fixedLink };
          }
        } catch {}

        const subs = getSubscribersForSessionStmt.all(sid);
        // Build seat map to include row/seat details in notifications
        const seatIndex = buildSeatIndex(hallPlaces);
        const details = availablePlacesKeys
          .map((pid) => seatIndex.get(pid))
          .filter(Boolean)
          .sort((a, b) => a.row - b.row || a.seat - b.seat);

        let notified = 0;
        for (const row of subs) {
          const uid = Number(row.user_id);
          const last = getUserNotifyStateStmt.get(uid, sid);
          const lastCount = last ? last.last_count : null;
          if (lastCount === availableCount) continue; // no change for this user

          try {
            if (availableCount > 0) {
              const lines = details
                .slice(0, 20)
                .map((d) => `• ряд ${d.row}, место ${d.seat}`)
                .join("\n");
              const more =
                details.length > 20
                  ? `\n… и еще ${details.length - 20} мест`
                  : "";
              const title = `${sessionInfo.title}${
                sessionInfo.date_text ? " — " + sessionInfo.date_text : ""
              }`;
              const esc = (s = "") =>
                String(s)
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;")
                  .replace(/"/g, "&quot;");
              const text = `<b>🎟️ Доступно ${availableCount} мест</b>\n<a href="${
                sessionInfo.link
              }">${esc(title)}</a>\n${esc(lines)}${more}`;
              await bot.sendMessage(uid, text, { parseMode: "HTML" });
            } else {
              const title = `${sessionInfo.title}${
                sessionInfo.date_text ? " — " + sessionInfo.date_text : ""
              }`;
              const esc = (s = "") =>
                String(s)
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;")
                  .replace(/"/g, "&quot;");
              const text = `❌ Билеты на сеанс <b>${esc(
                title
              )}</b> закончились.`;
              await bot.sendMessage(uid, text, { parseMode: "HTML" });
            }
            upsertNotifyStateStmt.run(uid, sid, availableCount);
            notified += 1;
          } catch (e) {
            console.log(`[notify.error] user ${uid}:`, e?.message || e);
          }
        }

        if (notified > 0) {
          console.log(
            `[notify.info] session ${sid}: notified ${notified} users (available=${availableCount})`
          );
        }
        lastAvailability.set(sid, availableCount);
      } catch (e) {
        console.log(`[poll.error] session ${sid}:`, e?.message || e);
      }
    }
  } catch (e) {
    console.log("[poll.error] loop:", e?.message || e);
  }
}, POLL_INTERVAL_MS);

// bot.sendMessage(ADMIN_CHAT_ID, "Опрос запущен!");

// setInterval(() => {
//   bot.sendMessage(ADMIN_CHAT_ID, "Опрос идет, все ок!");
// }, 60000 * 60);

bot.start();
