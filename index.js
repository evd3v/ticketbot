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

const TELEGRAM_BOT_TOKEN = "7779682896:AAH6P-49X377zxJppqeNWr3cIhR5kDECrIc";

const ADMIN_CHAT_ID = 875484579;
const ANGEL_CHAT_ID = 384686618;

const PORT = process.env.PORT || 10010; // internal, fronted by Nginx
const WEB_APP_URL = process.env.WEB_APP_URL || "http://localhost:10000/webapp"; // public via Nginx
const CAN_USE_WEB_APP = /^https:\/\//i.test(WEB_APP_URL);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "https://quicktickets.ru";
const DEFAULT_ORG = "orel-teatr-svobodnoe-prostranstvo";
const ORG_LIST = [
  "orel-teatr-kukol",
  "orel-teatr-turgeneva",
  "orel-teatr-russkij-stil-bahtina",
  "orel-teatr-svobodnoe-prostranstvo",
];
const ORG_AUTH = {
  "orel-teatr-svobodnoe-prostranstvo":
    "Basic YjBkNDUxMDBmNGYxMzY2Y2E0OTVmMDZhMzFkMDI4Yzc0NDUxNzQ1MjZmMzM1MDVmYTA0ZjQ1OGRjZjc2ZmExZQ==",
  "orel-teatr-kukol":
    "Basic ZDIyMGJjNDlhOWM5NzM0YzRiNzM4NTdkOGJjZTRjNjMzNmYyNmQyNDE4N2ZkZmU0MzMwNzliZjUxODZkNjQwOQ==",
  "orel-teatr-turgeneva":
    "Basic OTEwZGVlNmE1ZWM3OGY0YTg0ZDMxODQ0YzVjMTBhYmNhNmZlNDBiZTY1NDZiNmNkZDE2MTFkZWVkZTg1OWRmOQ==",
  "orel-teatr-russkij-stil-bahtina":
    "Basic OTEwZGVlNmE1ZWM3OGY0YTg0ZDMxODQ0YzVjMTBhYmNhNmZlNDBiZTY1NDZiNmNkZDE2MTFkZWVkZTg1OWRmOQ==",
};
const HALL_USER_ID = "1190633";
const ANYTICKET_USER_ID = HALL_USER_ID;

function parseSessionKey(key) {
  const s = String(key);
  const i = s.indexOf(":");
  return i >= 0 ? { org: s.slice(0, i), id: s.slice(i + 1) } : { org: DEFAULT_ORG, id: s };
}

function linkFromSessionKey(key) {
  const { org, id } = parseSessionKey(key);
  return `${BASE_URL}/${org}/s${id}`;
}

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

const getPlaces = async (key) => {
  const { org, id } = parseSessionKey(key);
  try {
    const tokenPreview = ORG_AUTH[org] ? String(ORG_AUTH[org]).slice(0, 12) + "…" : "none";
    console.log(
      `[qt.debug] getPlaces ${org}:${id} uid=${ANYTICKET_USER_ID} auth=${Boolean(
        ORG_AUTH[org]
      )} token=${tokenPreview}`
    );
    const response = await axios.get(
      "https://api.quicktickets.ru/v1/anyticket/anyticket",
      {
        params: {
          scope: "qt",
          panel: "site",
          user_id: ANYTICKET_USER_ID,
          organisation_alias: org,
          elem_type: "session",
          elem_id: id,
        },
        headers: {
          accept: "application/json, text/plain, */*",
          "accept-language": "ru,en-US;q=0.9,en;q=0.8,ru-RU;q=0.7",
          "api-id": "quick-tickets",
          ...(ORG_AUTH[org]
            ? { authorization: ORG_AUTH[org], Authorization: ORG_AUTH[org] }
            : {}),
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
    const data = response.data;
    if (!data?.response?.places || typeof data.response.places !== "object") {
      let preview;
      try {
        preview = JSON.stringify(data).slice(0, 500);
      } catch {
        preview = String(data).slice(0, 500);
      }
      console.log(
        `[qt.warn] getPlaces ${org}:${id} unexpected payload:`,
        preview
      );
    }
    return data;
  } catch (e) {
    const status = e?.response?.status;
    let body = e?.response?.data;
    try { body = typeof body === "string" ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500); } catch {}
    const bodyStr = body || e.message;
    const invalid = status === 400 && /invalid_token/i.test(String(bodyStr));
    if (invalid) {
      try {
        const response2 = await axios.get(
          "https://api.quicktickets.ru/v1/anyticket/anyticket",
          {
            params: {
              scope: "qt",
              panel: "site",
              user_id: HALL_USER_ID,
              organisation_alias: org,
              elem_type: "session",
              elem_id: id,
            },
            headers: {
              accept: "application/json, text/plain, */*",
              "accept-language": "ru,en-US;q=0.9,en;q=0.8,ru-RU;q=0.7",
              "api-id": "quick-tickets",
              ...(ORG_AUTH[org]
                ? { authorization: ORG_AUTH[org], Authorization: ORG_AUTH[org] }
                : {}),
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
        const data2 = response2.data;
        console.log(`[qt.info] getPlaces ${org}:${id} fallback retry (with auth)`);
        return data2;
      } catch (e2) {
        const st2 = e2?.response?.status;
        let body2 = e2?.response?.data;
        try { body2 = typeof body2 === "string" ? body2.slice(0, 500) : JSON.stringify(body2).slice(0, 500); } catch {}
        console.log(`[qt.error] getPlaces ${org}:${id} fallback:`, st2, body2 || e2.message);
      }
    }
    console.log(`[qt.error] getPlaces ${org}:${id}:`, status, bodyStr);
    return null;
  }
};

const getHallData = async (key) => {
  const { org, id } = parseSessionKey(key);
  try {
    const tokenPreview = ORG_AUTH[org] ? String(ORG_AUTH[org]).slice(0, 12) + "…" : "none";
    console.log(
      `[qt.debug] getHallData ${org}:${id} uid=${HALL_USER_ID} auth=${Boolean(
        ORG_AUTH[org]
      )} token=${tokenPreview}`
    );
    const response = await axios.get(
      "https://api.quicktickets.ru/v1/hall/hall",
      {
        params: {
          scope: "qt",
          panel: "site",
          user_id: HALL_USER_ID,
          organisation_alias: org,
          elem_type: "session",
          elem_id: id,
        },
        headers: {
          accept: "application/json, text/plain, */*",
          "accept-language": "ru,en-US;q=0.9,en;q=0.8,ru-RU;q=0.7",
          "api-id": "quick-tickets",
          ...(ORG_AUTH[org] ? { authorization: ORG_AUTH[org] } : {}),
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
    const data = response.data;
    if (!data?.response?.places || typeof data.response.places !== "object") {
      let preview;
      try {
        preview = JSON.stringify(data).slice(0, 500);
      } catch {
        preview = String(data).slice(0, 500);
      }
      console.log(
        `[qt.warn] getHallData ${org}:${id} unexpected payload:`,
        preview
      );
    }
    return data;
  } catch (e) {
    const status = e?.response?.status;
    let body = e?.response?.data;
    try { body = typeof body === "string" ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500); } catch {}
    const bodyStr = body || e.message;
    const invalid = status === 400 && /invalid_token/i.test(String(bodyStr));
    if (invalid) {
      try {
        const response2 = await axios.get(
          "https://api.quicktickets.ru/v1/hall/hall",
          {
            params: {
              scope: "qt",
              panel: "site",
              user_id: ANYTICKET_USER_ID,
              organisation_alias: org,
              elem_type: "session",
              elem_id: id,
            },
            headers: {
              accept: "application/json, text/plain, */*",
              "accept-language": "ru,en-US;q=0.9,en;q=0.8,ru-RU;q=0.7",
              "api-id": "quick-tickets",
              ...(ORG_AUTH[org] ? { authorization: ORG_AUTH[org] } : {}),
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
        const data2 = response2.data;
        console.log(`[qt.info] getHallData ${org}:${id} fallback retry (with auth)`);
        return data2;
      } catch (e2) {
        const st2 = e2?.response?.status;
        let body2 = e2?.response?.data;
        try { body2 = typeof body2 === "string" ? body2.slice(0, 500) : JSON.stringify(body2).slice(0, 500); } catch {}
        console.log(`[qt.error] getHallData ${org}:${id} fallback:`, st2, body2 || e2.message);
      }
    }
    console.log(`[qt.error] getHallData ${org}:${id}:`, status, bodyStr);
    return null;
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

const scrapeSessions = async () => {
  const out = [];
  for (const org of ORG_LIST) {
    const url = `${BASE_URL}/${org}`;
    const res = await axios.get(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        "accept-language": "ru-RU,ru;q=0.9,en;q=0.8",
      },
    });
    const $ = cheerioLoad(res.data);
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
        const num = m[1];
        const key = `${org}:${num}`;
        const dateText = $a.find(".underline").text().trim() || $a.text().trim();
        const link = new URL(href, BASE_URL).toString();
        out.push({ id: key, title, date: dateText, link, org });
      });
    });
  }
  return out;
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
      org: s.org || parseSessionKey(s.id).org,
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
            link: linkFromSessionKey(id),
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
          const gp = await getPlaces(sid);
          const hd = await getHallData(sid);
          const gpPlaces = gp?.response?.places;
          const hdPlaces = hd?.response?.places;
          const entrance = hd?.response?.entranceplaces;
          const hasEntrance =
            entrance && typeof entrance === "object" && Object.keys(entrance).length > 0;
          if ((!gpPlaces || typeof gpPlaces !== "object") && !hasEntrance) {
            const { org, id } = parseSessionKey(sid);
            console.log(`[poll.warn] snapshot ${org}:${id} places missing`);
            continue;
          }
          if ((!hdPlaces || typeof hdPlaces !== "object") && !hasEntrance) {
            const { org, id } = parseSessionKey(sid);
            console.log(`[poll.warn] snapshot ${org}:${id} hall missing`);
            continue;
          }

          let availableCount = 0;
          let hallPlaces = hdPlaces;
          let availablePlacesKeys = [];
          if (hasEntrance) {
            availableCount = Object.values(entrance).reduce(
              (n, x) => n + (Number(x?.count) || 0),
              0
            );
            hallPlaces = {};
            availablePlacesKeys = [];
          } else {
            const places = gpPlaces;
            const placesKeys = Object.keys(places);
            const hallPlacesKeys = Object.keys(hallPlaces);
            availablePlacesKeys = hallPlacesKeys.filter((key) => !placesKeys.includes(key));
            availableCount = availablePlacesKeys.length;
          }

          upsertNotifyStateStmt.run(user.id, String(sid), availableCount);

          try {
            const sessionInfo = getSessionByIdStmt.get(String(sid)) || {
              id: String(sid),
              title: "Сеанс",
              date_text: "",
              link: linkFromSessionKey(sid),
            };
            let details = [];
            if (!hasEntrance) {
              const seatIndex = buildSeatIndex(hallPlaces);
              details = availablePlacesKeys
                .map((pid) => ({ pid, info: seatIndex.get(pid) }))
                .filter((x) => !!x.info)
                .sort(
                  (a, b) =>
                    zoneOrder(a.info.zone) - zoneOrder(b.info.zone) ||
                    a.info.row - b.info.row ||
                    a.info.seat - b.info.seat
                )
                .map((x) => x.info);
            }
            const title = `${sessionInfo.title}${
              sessionInfo.date_text ? " — " + sessionInfo.date_text : ""
            }`;
            const esc = (s = "") =>
              String(s)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;");
            if (availableCount > 0) {
              const lines = details
                .slice(0, 20)
                .map((d) => `• ${d.zone} — ряд ${d.row}, место ${d.seat}`)
                .join("\n");
              const more =
                details.length > 20
                  ? `\n… и еще ${details.length - 20} мест`
                  : "";
              const msg = `<b>🎟️ Доступно ${availableCount} мест</b>\n<a href="${
                sessionInfo.link
              }">${esc(title)}</a>\n${esc(lines)}${more}`;
              await safeSendMessage(user.id, msg, { parseMode: "HTML" });
            } else {
              const msg = `❌ Билеты на сеанс <b>${esc(title)}</b> закончились.`;
              await safeSendMessage(user.id, msg, { parseMode: "HTML" });
            }
          } catch (e) {
            console.log("[notify.error] immediate:", e?.message || e);
          }
        } catch (e) {
          // ignore snapshot errors
        }
      }
    }
    if (removed.length) {
      try {
        const delStmt = db.prepare(
          "DELETE FROM notify_state WHERE user_id = ? AND session_id = ?"
        );
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
      console.log(
        "[bot.error] sendMessage:",
        e?.response?.data || e?.message || e
      )
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
      return safeSendMessage(chatId, "Пока нет активных подписок.", {
        replyMarkup: replyUnsubKeyboard(),
      });
    }
    const items = rows
      .map((r) => getSessionByIdStmt.get(String(r.session_id)))
      .filter(Boolean)
      .sort(
        (a, b) =>
          dateSortKeyRU(a.date_text || a.date || "") -
          dateSortKeyRU(b.date_text || b.date || "")
      );
    const lines = items.map(
      (s) =>
        `• <b>${(s.title || "Сеанс")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</b> — ${(s.date_text || s.date || "")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}`
    );
    const text = [`<b>Ваши подписки (${lines.length})</b>`, ...lines].join(
      "\n"
    );
    return safeSendMessage(chatId, text, {
      parseMode: "HTML",
      replyMarkup: replyUnsubKeyboard(),
    });
  } catch (e) {
    console.log("[cmd.error] /subscription:", e?.message || e);
    return safeSendMessage(chatId, "Не удалось получить список подписок.");
  }
});

bot.on("/unsubscribe_all", (msg) => {
  const chatId = msg.from?.id || msg.chat?.id;
  if (!chatId) return;
  const ok = clearAllSubscriptions(chatId);
  safeSendMessage(
    chatId,
    ok ? "Все подписки сняты." : "Не удалось снять подписки, попробуйте позже."
  );
});

bot.on("/unsuball", (msg) => {
  const chatId = msg.from?.id || msg.chat?.id;
  if (!chatId) return;
  const ok = clearAllSubscriptions(chatId);
  safeSendMessage(
    chatId,
    ok ? "Все подписки сняты." : "Не удалось снять подписки, попробуйте позже."
  );
});

bot.on("/unsub", (msg) => {
  const chatId = msg.from?.id || msg.chat?.id;
  if (!chatId) return;
  const ok = clearAllSubscriptions(chatId);
  safeSendMessage(
    chatId,
    ok ? "Все подписки сняты." : "Не удалось снять подписки, попробуйте позже."
  );
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
      return safeSendMessage(
        chatId,
        `Чтобы открыть мини‑приложение: откройте профиль бота (нажмите на имя бота вверху чата) → раздел «Приложение»/«Apps».`,
        { parseMode: "HTML" }
      );
    }
    if (/^отписаться от всех$/i.test(text.trim())) {
      const ok = clearAllSubscriptions(chatId);
      return safeSendMessage(
        chatId,
        ok
          ? "Все подписки сняты."
          : "Не удалось снять подписки, попробуйте позже."
      );
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
        const gp = await getPlaces(sid);
        const hd = await getHallData(sid);
        const gpPlaces = gp?.response?.places;
        const hdPlaces = hd?.response?.places;
        const entrance = hd?.response?.entranceplaces;
        const hasEntrance =
          entrance && typeof entrance === "object" && Object.keys(entrance).length > 0;
        if ((!gpPlaces || typeof gpPlaces !== "object") && !hasEntrance) {
          const { org, id } = parseSessionKey(sid);
          console.log(`[poll.warn] session ${org}:${id} places missing`);
          continue;
        }
        if ((!hdPlaces || typeof hdPlaces !== "object") && !hasEntrance) {
          const { org, id } = parseSessionKey(sid);
          console.log(`[poll.warn] session ${org}:${id} hall missing`);
          continue;
        }

        let availablePlacesKeys = [];
        let availableCount = 0;
        let hallPlaces = hdPlaces;
        if (hasEntrance) {
          availableCount = Object.values(entrance).reduce(
            (n, x) => n + (Number(x?.count) || 0),
            0
          );
          hallPlaces = {};
          availablePlacesKeys = [];
        } else {
          const places = gpPlaces;
          const placesKeys = Object.keys(places);
          const hallPlacesKeys = Object.keys(hallPlaces);
          availablePlacesKeys = hallPlacesKeys.filter((key) => !placesKeys.includes(key));
          availableCount = availablePlacesKeys.length;
        }

        const prevGlobal = lastAvailability.get(sid);
        const changedGlobally =
          prevGlobal === undefined || prevGlobal !== availableCount;

        const subs = getSubscribersForSessionStmt.all(sid);
        let forceForUsers = false;
        if (!changedGlobally) {
          for (const row of subs) {
            const probe = getUserNotifyStateStmt.get(Number(row.user_id), sid);
            const lc = probe ? probe.last_count : null;
            if (lc === -1) {
              forceForUsers = true;
              break;
            }
          }
        }
        if (!changedGlobally && !forceForUsers) continue;

        const sessionInfo = getSessionByIdStmt.get(sid) || {
          id: sid,
          title: "Сеанс",
          date_text: "",
          link: linkFromSessionKey(sid),
        };

        
        const seatIndex = buildSeatIndex(hallPlaces);
        const details = availablePlacesKeys
          .map((pid) => ({ pid, info: seatIndex.get(pid) }))
          .filter((x) => !!x.info)
          .sort(
            (a, b) =>
              zoneOrder(a.info.zone) - zoneOrder(b.info.zone) ||
              a.info.row - b.info.row ||
              a.info.seat - b.info.seat
          )
          .map((x) => x.info);

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
                .map((d) => `• ${d.zone} — ряд ${d.row}, место ${d.seat}`)
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
}, 5000);

// bot.sendMessage(ADMIN_CHAT_ID, "Опрос запущен!");

// setInterval(() => {
//   bot.sendMessage(ADMIN_CHAT_ID, "Опрос идет, все ок!");
// }, 60000 * 60);

bot.start();
