import axios from "axios";
import TeleBot from "telebot";
import qs from "qs";

const TELEGRAM_BOT_TOKEN = "7779682896:AAGCT0knRD9IzLJB6tArnFmRHP8R7yirwoc";

const ADMIN_CHAT_ID = 875484579;
const ANGEL_CHAT_ID = 384686618;

let isOrderBooked = false;

const SESSIONS = [
  {
    id: "2440",
    date: "23 октября 19:00",
    link: "https://quicktickets.ru/orel-teatr-svobodnoe-prostranstvo/s2440",
  },
  // {id: '2439', date: '10 октября 19:00', link: 'https://quicktickets.ru/orel-teatr-svobodnoe-prostranstvo/s2439'},
  // {id: '2438', date: '09 октября 19:00', link: 'https://quicktickets.ru/orel-teatr-svobodnoe-prostranstvo/s2438'},
  {
    id: "2491",
    date: "13 ноября 19:00",
    link: "https://quicktickets.ru/orel-teatr-svobodnoe-prostranstvo/s2491",
  },
  {
    id: "2492",
    date: "14 ноября 19:00",
    link: "https://quicktickets.ru/orel-teatr-svobodnoe-prostranstvo/s2492",
  },
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

const bot = new TeleBot({
  token: TELEGRAM_BOT_TOKEN, // Required. Telegram Bot API token.
});

setInterval(async () => {
  for await (let session of SESSIONS) {
    const {
      response: { places },
    } = await getPlaces(session.id);

    const {
      response: { places: hallPlaces },
    } = await getHallData(session.id);

    const placesKeys = Object.keys(places);
    const hallPlacesKeys = Object.keys(hallPlaces);

    const availablePlacesKeys = hallPlacesKeys.filter(
      (key) => !placesKeys.includes(key)
    );

    if (availablePlacesKeys.length > 0) {
      bot.sendMessage(
        ANGEL_CHAT_ID,
        `На сеанс ${session.date} есть ${availablePlacesKeys.length} доступных мест!\nСсылка на покупку: ${session.link}`
      );
      bot.sendMessage(
        ADMIN_CHAT_ID,
        `На сеанс ${session.date} есть ${availablePlacesKeys.length} доступных мест!\nСсылка на покупку: ${session.link}`
      );

      if (!isOrderBooked) {
        bot.sendMessage(ANGEL_CHAT_ID, `Попытка бронирования...`);
        bot.sendMessage(ADMIN_CHAT_ID, `Попытка бронирования...`);

        const res = await makeOrder(session.id, availablePlacesKeys[0]);

        if (res?.data?.result === "error") {
          bot.sendMessage(
            ANGEL_CHAT_ID,
            `Ошибка в процессе бронирования, билет уже купили :(`
          );
          bot.sendMessage(
            ADMIN_CHAT_ID,
            `Ошибка в процессе бронирования, билет уже купили :(`
          );
          return;
        }

        await confirmBooking();

        setTimeout(() => {
          bot.sendMessage(ANGEL_CHAT_ID, `Бронь закончилась :(`);
          bot.sendMessage(ADMIN_CHAT_ID, `Бронь закончилась :(`);
          isOrderBooked = false;
        }, 60000 * 3);
        bot.sendMessage(
          ANGEL_CHAT_ID,
          `Билет забронирован! Есть 3 минуты на оплату!\nСсылка: https://quicktickets.ru/ordering/anytickets`
        );
        bot.sendMessage(
          ADMIN_CHAT_ID,
          `Билет забронирован! Есть 3 минуты на оплату!\nСсылка: https://quicktickets.ru/ordering/anytickets`
        );
        isOrderBooked = true;
      }
    }
  }
}, 5000);

bot.sendMessage(ADMIN_CHAT_ID, "Опрос запущен!");

setInterval(() => {
  bot.sendMessage(ADMIN_CHAT_ID, "Опрос идет, все ок!");
}, 60000 * 60);

bot.start();
