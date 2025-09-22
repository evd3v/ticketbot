import axios from "axios";
import TeleBot from "telebot";
import qs from "qs";
import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { load as cheerioLoad } from "cheerio";

const TELEGRAM_BOT_TOKEN = "7779682896:AAGCT0knRD9IzLJB6tArnFmRHP8R7yirwoc";

const ADMIN_CHAT_ID = 875484579;
const ANGEL_CHAT_ID = 384686618;

const PORT = process.env.PORT || 10000;
const WEB_APP_URL = process.env.WEB_APP_URL || "http://localhost:10000/webapp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "https://quicktickets.ru";
const ORG_ALIAS = "orel-teatr-svobodnoe-prostranstvo";
const ORG_URL = `${BASE_URL}/${ORG_ALIAS}`;

let isOrderBooked = false;

const SESSIONS = [
  {
    id: "2809",
    date: "Анна, сны. 05 октября 18:00",
    link: "https://quicktickets.ru/orel-teatr-svobodnoe-prostranstvo/s2809",
  },
  {
    id: "2804",
    date: "Яга. 08 октября 19:00",
    link: "https://quicktickets.ru/orel-teatr-svobodnoe-prostranstvo/s2804",
  },
  {
    id: "2805",
    date: "Яга. 09 октября 19:00",
    link: "https://quicktickets.ru/orel-teatr-svobodnoe-prostranstvo/s2805",
  },
  // {
  //     id: "2776",
  //     date: "21 сентября 18:00",
  //     link: "https://quicktickets.ru/orel-teatr-svobodnoe-prostranstvo/s2776",
  // },
  // {
  //     id: "2777",
  //     date: "24 сентября 19:00",
  //     link: "https://quicktickets.ru/orel-teatr-svobodnoe-prostranstvo/s2777",
  // },
  // {id: '2439', date: '10 октября 19:00', link: 'https://quicktickets.ru/orel-teatr-svobodnoe-prostranstvo/s2439'},
  // {id: '2438', date: '09 октября 19:00', link: 'https://quicktickets.ru/orel-teatr-svobodnoe-prostranstvo/s2438'},
];

const getPlaces = async (id) => {
  try {
    const response = await axios.get(
      "https://api.quicktickets.ru/v1/anyticket/anyticket",
      {
        params: {
          scope: "qt",
          panel: "site",
          user_id: "0",
          organisation_alias: "orel-teatr-svobodnoe-prostranstvo",
          elem_type: "session",
          elem_id: id,
        },
        headers: {
          accept: "application/json, text/plain, */*",
          "accept-language": "ru,en-US;q=0.9,en;q=0.8,ru-RU;q=0.7",
          "api-id": "quick-tickets",
          authorization:
            "Basic NTA3MDRlY2RhOGViMzc3M2UzMjBjY2NkZjU0ZDM0NWQyNTIxZmMyNjhhNGM3OGM2MDJkM2ZhNWRmMmMyMDAwNA==",
          "cache-control": "no-cache",
          origin: "https://hall.quicktickets.ru",
          pragma: "no-cache",
          priority: "u=1, i",
          referer: "https://hall.quicktickets.ru/",
          "sec-ch-ua":
            '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"macOS"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-site",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        },
      }
    );

    return response.data;
  } catch (e) {
    console.log("Ошибка в процессе получения мест");
  }
};

const getHallData = async (id) => {
  try {
    const response = await axios.get(
      "https://api.quicktickets.ru/v1/hall/hall",
      {
        params: {
          scope: "qt",
          panel: "site",
          user_id: "0",
          organisation_alias: "orel-teatr-svobodnoe-prostranstvo",
          elem_type: "session",
          elem_id: id,
        },
        headers: {
          accept: "application/json, text/plain, */*",
          "accept-language": "ru,en-US;q=0.9,en;q=0.8,ru-RU;q=0.7",
          "api-id": "quick-tickets",
          authorization:
            "Basic NTA3MDRlY2RhOGViMzc3M2UzMjBjY2NkZjU0ZDM0NWQyNTIxZmMyNjhhNGM3OGM2MDJkM2ZhNWRmMmMyMDAwNA==",
          "cache-control": "no-cache",
          origin: "https://hall.quicktickets.ru",
          pragma: "no-cache",
          priority: "u=1, i",
          referer: "https://hall.quicktickets.ru/",
          "sec-ch-ua":
            '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"macOS"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-site",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        },
      }
    );
    return response.data;
  } catch (error) {
    console.log("ошибка в процессе получения доступных места");
  }
};

const makeOrder = async (id, placeId) => {
  try {
    return axios.post(
      "https://quicktickets.ru/ordering/initAnytickets",
      qs.stringify({
        organisationAlias: "orel-teatr-svobodnoe-prostranstvo",
        elemType: "session",
        elemId: id,
        collectiveSell: 0,
        "sessionAnyplaces[hallplaces][]": placeId,
        "sessionAnyplaces[count]": 1,
        "sessionAnyplaces[amount]": 550,
      }),
      {
        headers: {
          accept: "*/*",
          "accept-language": "ru,en-US;q=0.9,en;q=0.8,ru-RU;q=0.7",
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          cookie:
            "__ddg1_=Ojf9tIGlyafFDUIN51KZ; _ym_uid=1692937751358583270; _ym_d=1727635932; tmr_lvid=d3db5cd848bbf31e364b67df669011d1; tmr_lvidTS=1692937750839; supportOnlineTalkID=dCBri8wAUha6ZScH1SrO8D4TpA7xoHZM; qt__auth=Ah%3A%21%5BpjR; a64a0cbe80ad1d56e2d25cdbb9e613e7=7d097dd9d9a502117544dce107e45f794a3cd92ca%3A4%3A%7Bi%3A0%3Bi%3A1190633%3Bi%3A1%3Bs%3A17%3A%22martynov.okeu2010%22%3Bi%3A2%3Bi%3A7776000%3Bi%3A3%3Ba%3A1%3A%7Bs%3A5%3A%22email%22%3Bs%3A27%3A%22martynov.okeu2010%40yandex.ru%22%3B%7D%7D; __ddgid_=vUubFWDYXyAFlUBz; __ddg2_=ca9pgfRNqDcRWKS9; __ddg9_=202.78.166.250; _ym_isad=1; domain_sid=ky7G2hM58YfaG76fYl-_w%3A1728886460024; PHPSESSID=m1ne6j73t3prskeircj8u7cjv2; _ym_visorc=b; __ddgmark_=Lu25YKfWFgLieprN; __ddg5_=sLzShXVAKRcsqL2Y; __ddg10_=1728899591; cityId=528; __ddg8_=SefhBYljZkRKwR35; tmr_detect=1%7C1728899591940",
          origin: "https://quicktickets.ru",
          priority: "u=1, i",
          referer:
            "https://quicktickets.ru/orel-teatr-svobodnoe-prostranstvo/s2477",
          "sec-ch-ua":
            '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"macOS"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
          "x-requested-with": "XMLHttpRequest",
        },
      }
    );
  } catch (e) {
    console.log("Ошибка в процессе бронирования");
  }
};

const confirmBooking = async () => {
  try {
    await axios.post(
      "https://quicktickets.ru/ordering/check_email_and_phone",
      qs.stringify({
        email: "martynov.okeu2010@yandex.ru",
        phone: "+7 995 447-15-75",
        organisationId: 2157,
      }),
      {
        headers: {
          accept: "*/*",
          "accept-language": "ru,en-US;q=0.9,en;q=0.8,ru-RU;q=0.7",
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          cookie:
            "__ddg1_=Ojf9tIGlyafFDUIN51KZ; _ym_uid=1692937751358583270; _ym_d=1727635932; tmr_lvid=d3db5cd848bbf31e364b67df669011d1; tmr_lvidTS=1692937750839; supportOnlineTalkID=dCBri8wAUha6ZScH1SrO8D4TpA7xoHZM; qt__auth=Ah%3A%21%5BpjR; a64a0cbe80ad1d56e2d25cdbb9e613e7=7d097dd9d9a502117544dce107e45f794a3cd92ca%3A4%3A%7Bi%3A0%3Bi%3A1190633%3Bi%3A1%3Bs%3A17%3A%22martynov.okeu2010%22%3Bi%3A2%3Bi%3A7776000%3Bi%3A3%3Ba%3A1%3A%7Bs%3A5%3A%22email%22%3Bs%3A27%3A%22martynov.okeu2010%40yandex.ru%22%3B%7D%7D; __ddgid_=vUubFWDYXyAFlUBz; __ddg2_=ca9pgfRNqDcRWKS9; __ddg9_=202.78.166.250; _ym_isad=1; domain_sid=ky7G2hM58YfaG76fYl-_w%3A1728886460024; PHPSESSID=m1ne6j73t3prskeircj8u7cjv2; _ym_visorc=b; __ddgmark_=Lu25YKfWFgLieprN; __ddg5_=sLzShXVAKRcsqL2Y; tmr_detect=1%7C1728899915671; organisationAlias=orel-teatr-svobodnoe-prostranstvo; __ddg8_=HvQbIpQ8p2tiz6Wg; __ddg10_=1728899922; cityId=528",
          origin: "https://quicktickets.ru",
          priority: "u=1, i",
          referer: "https://quicktickets.ru/ordering/anytickets",
          "sec-ch-ua":
            '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"macOS"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
          "x-requested-with": "XMLHttpRequest",
        },
      }
    );
  } catch (e) {
    console.log("ошибка в процессе подтверждения бронирования");
  }
};

const extendBooking = async (id) => {
  try {
    await axios.post(
      "https://quicktickets.ru/ordering/extend",
      qs.stringify({
        organisationAlias: "orel-teatr-svobodnoe-prostranstvo",
        elemType: "session",
        elemId: id,
        anyticketsCodes: "xqS9bOxiff",
        grecaptcha:
          "03AFcWeA6tZ0wl9ibwUHkyygyPkYcqtEIIrjNxf7D5c7vA5ts3fK60LHy60ajXUlIdP5iU1hCYhRl8xWFE92fCnJfvdMZbMXFWx0MmXkoupO5p1Ai_Zb0nAbyqYi33q5bPbJ9gUGkB2y6ZePf8IVFzjia30-jDtW-VeFypN8gd9sojMhtg7blLycuQkj1jLQCcgnsEZxV8bjBlVlqjz_3dtQGa6eXH4i7XY7aJVSGX1KeB1Ljq-F12jEZd9cHtqN75plTZ-v7zUFo531Zvjj4t0Qbg9FNElBiLDosxTUZT4rjqVW3-43v34J2PANGPbFRLtcPJyEc2mCaF0-qFL77Fuw3iglxofLoSsVGcNICleu4rokfVQhUjaBP3jddrpMuKhcsZy_ukJX22LlqFF4oa2LJIdCNnFGHFoGxdPlqq2QXq_agiAZaBjMnE68fROHMYIgRu6jKWcb-YKJUWnC8tbaOQwaXfJJilcFzzNGuwPNF2k0eJh2h2leRPXbzm15nccTw3ie8N4XZ-lmQXTq_eypNO8xi_HdBiQ-LOiE63V8EOuAHqdKNDIX6eGNI5raHgUzeaEQ4O3svevx1bZ0qU68HPFj9hLOwJxDVyvDs8ddthJ0xILw1_YMR_kx7Gg-YFV4vJnv-6AVLndqfEWm3HTAwDqfTnJiHxXi74YEDHmTv91aNqEN-aVRjbK8AiSyD-uRbuH2PsjsL6PZf6n5gqY3pBVvAjELAF2_zq4UcvAJ6vQ0HP_innPkk-47ru5N7Lo_HOkqwWY2-KH_tovmeVGWFvl-Hux16LBub9GfrOORRby5V9pW1Cvcei2QBFUzS9sjJPuNoW__F1XLg0J1yJgqGGJuoSRwGlk3JGnwr5X18Bpc7MT9iCouk",
      }),
      {
        headers: {
          accept: "*/*",
          "accept-language": "ru,en-US;q=0.9,en;q=0.8,ru-RU;q=0.7",
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          cookie:
            "__ddg1_=Ojf9tIGlyafFDUIN51KZ; _ym_uid=1692937751358583270; _ym_d=1727635932; tmr_lvid=d3db5cd848bbf31e364b67df669011d1; tmr_lvidTS=1692937750839; supportOnlineTalkID=dCBri8wAUha6ZScH1SrO8D4TpA7xoHZM; qt__auth=Ah%3A%21%5BpjR; a64a0cbe80ad1d56e2d25cdbb9e613e7=7d097dd9d9a502117544dce107e45f794a3cd92ca%3A4%3A%7Bi%3A0%3Bi%3A1190633%3Bi%3A1%3Bs%3A17%3A%22martynov.okeu2010%22%3Bi%3A2%3Bi%3A7776000%3Bi%3A3%3Ba%3A1%3A%7Bs%3A5%3A%22email%22%3Bs%3A27%3A%22martynov.okeu2010%40yandex.ru%22%3B%7D%7D; __ddgid_=vUubFWDYXyAFlUBz; __ddg2_=ca9pgfRNqDcRWKS9; __ddg9_=202.78.166.250; _ym_isad=1; domain_sid=ky7G2hM58YfaG76fYl-_w%3A1728886460024; PHPSESSID=m1ne6j73t3prskeircj8u7cjv2; _ym_visorc=b; __ddgmark_=Lu25YKfWFgLieprN; __ddg5_=sLzShXVAKRcsqL2Y; organisationAlias=orel-teatr-svobodnoe-prostranstvo; tmr_detect=1%7C1728900293277; __ddg8_=qk7tDrl8oolQGsTm; __ddg10_=1728900293; cityId=528",
          origin: "https://quicktickets.ru",
          priority: "u=1, i",
          referer: "https://quicktickets.ru/ordering/anytickets",
          "sec-ch-ua":
            '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"macOS"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
          "x-requested-with": "XMLHttpRequest",
        },
      }
    );
  } catch (e) {
    console.log("ошибка в процессе продления бронирования");
  }
};

// Ensure we are in polling mode: delete any existing webhook to avoid 409 Conflict errors
const ensurePollingMode = async () => {
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
};

await ensurePollingMode();

const bot = new TeleBot({
  token: TELEGRAM_BOT_TOKEN, // Required. Telegram Bot API token.
});

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

const scrapeSessions = async () => {
  const url = ORG_URL;
  const res = await axios.get(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
      "accept-language": "ru-RU,ru;q=0.9,en;q=0.8",
    },
  });
  const $ = cheerioLoad(res.data);
  const found = new Map(); // id -> session

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

  return [...found.values()];
};

const getSessionsList = async () => {
  const now = Date.now();
  if (sessionsCache.list.length && now - sessionsCache.ts < SESSIONS_TTL_MS) {
    return sessionsCache.list;
  }
  try {
    const list = await scrapeSessions();
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
  if (!user)
    return res.status(403).json({ ok: false, error: "INVALID_INIT_DATA" });
  try {
    upsertUser.run({
      id: user.id,
      username: user.username || null,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
    });
  } catch (e) {
    console.log("[db.error] upsertUser:", e?.message || e);
  }
  const list = await getSessionsList();
  const rows = getUserSubsStmt.all(user.id);
  const set = new Set(rows.map((r) => String(r.session_id)));
  // subscribed first
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
    // ensure sessions exist with minimal info
    const ensure = db.transaction((ids) => {
      for (const id of ids) {
        const existing = getSessionByIdStmt.get(id);
        if (!existing) {
          upsertSessionStmt.run({
            id,
            title: null,
            date_text: null,
            link: `${ORG_URL}/s${id}`,
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

// ---------------------------
// Bot commands: open WebApp
// ---------------------------
const webAppKeyboard = () => ({
  inline_keyboard: [
    [
      {
        text: "Открыть мини‑приложение",
        web_app: { url: WEB_APP_URL },
      },
    ],
  ],
});

bot.on("/start", (msg) => {
  const chatId = msg.from?.id || msg.chat.id;
  bot.sendMessage(
    chatId,
    "Управляйте подписками на спектакли через мини‑приложение:",
    { replyMarkup: webAppKeyboard() }
  );
});

bot.on("/manage", (msg) => {
  const chatId = msg.from?.id || msg.chat.id;
  bot.sendMessage(chatId, "Откройте мини‑приложение:", {
    replyMarkup: webAppKeyboard(),
  });
});

// Track last availability per session to send notifications only on change
const lastAvailability = new Map(); // sessionId -> number

setInterval(async () => {
  try {
    const sessionRows = getAllSubscribedSessionIdsStmt.all();
    const sessionIds = sessionRows.map((r) => String(r.session_id));
    for (const sid of sessionIds) {
      try {
        const {
          response: { places },
        } = await getPlaces(sid);
        const {
          response: { places: hallPlaces },
        } = await getHallData(sid);
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

        const sessionInfo = getSessionByIdStmt.get(sid) || {
          id: sid,
          title: "Сеанс",
          date_text: "",
          link: `${ORG_URL}/s${sid}`,
        };

        const subs = getSubscribersForSessionStmt.all(sid);
        let notified = 0;
        for (const row of subs) {
          const uid = Number(row.user_id);
          const last = getUserNotifyStateStmt.get(uid, sid);
          const lastCount = last ? last.last_count : null;
          if (lastCount === availableCount) continue; // no change for this user

          try {
            if (availableCount > 0) {
              await bot.sendMessage(
                uid,
                `🎟️ Доступно ${availableCount} мест на сеанс: ${
                  sessionInfo.title
                }${
                  sessionInfo.date_text ? " — " + sessionInfo.date_text : ""
                }\nСсылка: ${sessionInfo.link}`
              );
            } else {
              await bot.sendMessage(
                uid,
                `❌ Билеты на сеанс ${sessionInfo.title}${
                  sessionInfo.date_text ? " — " + sessionInfo.date_text : ""
                } закончились.`
              );
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
}, 5000);

// bot.sendMessage(ADMIN_CHAT_ID, "Опрос запущен!");

// setInterval(() => {
//   bot.sendMessage(ADMIN_CHAT_ID, "Опрос идет, все ок!");
// }, 60000 * 60);

bot.start();
