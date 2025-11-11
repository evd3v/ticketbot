import axios from "axios";
import { collectGuestCookies, collectGuestHeaders, shutdownBrowser } from "../lib/qtGuest.js";

const DEFAULT_AUTH_B64 =
  "OTEwZGVlNmE1ZWM3OGY0YTg0ZDMxODQ0YzVjMTBhYmNhNmZlNDBiZTY1NDZiNmNkZDE2MTFkZWVkZTg1OWRmOQ==";

function parseAuthMap(s) {
  const obj = {};
  try {
    if (!s) return obj;
    let j = null;
    try {
      j = JSON.parse(s);
    } catch {}
    if (j && typeof j === "object") return j;
    const parts = String(s)
      .split(/[;\,\n]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const part of parts) {
      const idx = part.indexOf("=");
      if (idx > 0) obj[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    }
  } catch {}
  return obj;
}

function getAuthForAlias(alias) {
  const MAP = parseAuthMap(process.env.QT_AUTH_MAP || "");
  const val = (MAP && alias && MAP[alias]) || process.env.QT_AUTH_B64 || DEFAULT_AUTH_B64;
  return String(val || "");
}

function parseInput(argv) {
  const map = new Map();
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "";
    if (v) i++;
    map.set(k, v);
  }
  return map;
}

function parseFromUrl(url) {
  const u = new URL(url);
  const parts = u.pathname.split("/").filter(Boolean);
  const alias = parts[0];
  const sidPart = parts.find((p) => /^s\d+$/.test(p));
  const sid = sidPart ? sidPart.slice(1) : null;
  return { alias, sid };
}

function cookieHeaderFromSetCookies(lines) {
  const parts = [];
  for (const line of lines || []) {
    const first = String(line).split(";")[0];
    if (first && first.includes("=")) parts.push(first.trim());
  }
  return parts.join("; ");
}

function buildHeaders(cookie, alias) {
  const h = {
    accept: "application/json, text/plain, */*",
    "accept-language": "ru,en-US;q=0.9,en;q=0.8,ru-RU;q=0.7",
    "api-id": "quick-tickets",
    origin: "https://hall.quicktickets.ru",
    pragma: "no-cache",
    referer: "https://hall.quicktickets.ru/",
    "cache-control": "no-cache",
    "sec-ch-ua": '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  };
  if (cookie) h.cookie = cookie;
  const b64 = getAuthForAlias(alias);
  if (b64) h.authorization = `Basic ${b64}`;
  return h;
}

function buildParams(alias, sid) {
  return {
    scope: "qt",
    panel: "site",
    user_id: process.env.QT_USER_ID || "1190633",
    organisation_alias: alias,
    elem_type: "session",
    elem_id: sid,
  };
}

async function main() {
  const args = parseInput(process.argv);
  let sid = args.get("sid") || "";
  let alias = args.get("alias") || "";
  const url = args.get("url") || "";

  if (url) {
    const p = parseFromUrl(url);
    if (p.alias) alias = p.alias;
    if (p.sid) sid = p.sid;
  }
  if (!sid || !alias) {
    console.log("Usage: node tools/qt_check.js --url <session_url> | --alias <alias> --sid <id>");
    process.exit(2);
  }

  const sessionUrl = `https://quicktickets.ru/${alias}/s${sid}`;
  console.log(`[test.info] session ${sid}, alias ${alias}`);

  // Пытаемся получить и cookies, и заголовок authorization как делает Web-приложение
  let setCookies = [];
  let capturedAuth = null;
  try {
    const userId = process.env.QT_USER_ID || "1190633";
    const cap = await collectGuestHeaders(alias, sid, userId);
    setCookies = cap?.setCookies || [];
    capturedAuth = cap?.authorization || null;
  } catch {}
  if (!setCookies.length) setCookies = await collectGuestCookies(sessionUrl);
  const cookieHeader = cookieHeaderFromSetCookies(setCookies);
  console.log(`[test.info] cookies: ${cookieHeader ? 'ok' : 'missing'}`);

  const headers = buildHeaders(cookieHeader, alias);
  if (capturedAuth) headers.authorization = capturedAuth;
  const params = buildParams(alias, sid);

  const hallUrl = "https://api.quicktickets.ru/v1/hall/hall";
  const anyUrl = "https://api.quicktickets.ru/v1/anyticket/anyticket";

  try {
    const hall = await axios.get(hallUrl, { params, headers });
    const any = await axios.get(anyUrl, { params, headers });
    const hallPlaces = hall?.data?.response?.places || {};
    const anyPlaces = any?.data?.response?.places || {};

    const hallKeys = Object.keys(hallPlaces);
    const anyKeys = Object.keys(anyPlaces);
    const availableKeys = hallKeys.filter((k) => !anyKeys.includes(k));

    console.log(`[test.ok] hall_places=${hallKeys.length} reserved=${anyKeys.length} available=${availableKeys.length}`);
  } catch (e) {
    const st = e?.response?.status;
    const t = e?.response?.data?.error?.type;
    console.log(`[test.error] status=${st} type=${t} msg=${e?.message}`);
    if (e?.response?.data) console.log(e.response.data);
    await shutdownBrowser();
    process.exit(1);
  }
  await shutdownBrowser();
  process.exit(0);
}

main();
