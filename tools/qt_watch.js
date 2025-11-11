import axios from "axios";
import { collectGuestCookies, collectGuestHeaders, shutdownBrowser } from "../lib/qtGuest.js";

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

function buildHeaders(cookie, auth) {
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
  if (auth) h.authorization = auth;
  return h;
}

function buildParams(alias, sid, userId) {
  return {
    scope: "qt",
    panel: "site",
    user_id: userId,
    organisation_alias: alias,
    elem_type: "session",
    elem_id: sid,
  };
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = parseInput(process.argv);
  let sid = args.get("sid") || "";
  let alias = args.get("alias") || "";
  const url = args.get("url") || "";
  const intervalMs = Number(args.get("interval") || process.env.WATCH_INTERVAL_MS || 5000);
  const userId = process.env.QT_USER_ID || "1190633";

  if (url) {
    const p = parseFromUrl(url);
    if (p.alias) alias = p.alias;
    if (p.sid) sid = p.sid;
  }
  if (!sid || !alias) {
    console.log("Usage: node tools/qt_watch.js --url <session_url> | --alias <alias> --sid <id> [--interval <ms>]");
    process.exit(2);
  }

  const sessionUrl = `https://quicktickets.ru/${alias}/s${sid}`;
  console.log(`[watch.info] session ${sid}, alias ${alias}, interval=${intervalMs}ms`);

  // Инициализация cookies/authorization как в вебе
  let setCookies = [];
  let capturedAuth = null;
  try {
    const cap = await collectGuestHeaders(alias, sid, userId);
    setCookies = cap?.setCookies || [];
    capturedAuth = cap?.authorization || null;
  } catch {}
  if (!setCookies.length) setCookies = await collectGuestCookies(sessionUrl);
  const cookieHeader = cookieHeaderFromSetCookies(setCookies);
  console.log(`[watch.info] cookies: ${cookieHeader ? 'ok' : 'missing'}${capturedAuth ? ', auth: ok' : ''}`);

  const headers = buildHeaders(cookieHeader, capturedAuth);
  const params = buildParams(alias, sid, userId);

  const hallUrl = "https://api.quicktickets.ru/v1/hall/hall";
  const anyUrl = "https://api.quicktickets.ru/v1/anyticket/anyticket";

  // Получаем неизменяемую схему зала один раз
  let hallPlaces = {};
  try {
    const hall = await axios.get(hallUrl, { params, headers });
    hallPlaces = hall?.data?.response?.places || {};
  } catch (e) {
    console.log(`[watch.error] hall: status=${e?.response?.status} type=${e?.response?.data?.error?.type} msg=${e?.message}`);
  }
  const hallKeys = Object.keys(hallPlaces);
  console.log(`[watch.info] hall_places=${hallKeys.length}`);

  let prevAvailable = null;
  let tick = 0;

  async function loop() {
    tick++;
    try {
      const any = await axios.get(anyUrl, { params, headers });
      const anyPlaces = any?.data?.response?.places || {};
      const anyKeys = Object.keys(anyPlaces);
      const availableKeys = hallKeys.filter((k) => !anyKeys.includes(k));
      const availableCount = availableKeys.length;
      const delta = prevAvailable == null ? 0 : availableCount - prevAvailable;
      prevAvailable = availableCount;
      console.log(`[watch.tick] #${tick} reserved=${anyKeys.length} available=${availableCount}${delta ? ` (Δ ${delta>0?'+':''}${delta})` : ''}`);
    } catch (e) {
      const st = e?.response?.status;
      const t = e?.response?.data?.error?.type;
      console.log(`[watch.error] anyticket: status=${st} type=${t} msg=${e?.message}`);
    } finally {
      setTimeout(loop, intervalMs);
    }
  }

  loop();

  process.on('SIGINT', async () => {
    console.log("\n[watch.info] stopping...");
    await shutdownBrowser();
    process.exit(0);
  });
}

main();
