import puppeteer from "puppeteer";

// Конфигурация запуска браузера для работы внутри Docker и без лишних зависимостей
const LAUNCH_OPTS = {
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--no-first-run",
    "--no-zygote",
  ],
};

let browser = null;

async function getBrowser() {
  if (browser) return browser;
  browser = await puppeteer.launch(LAUNCH_OPTS);
  return browser;
}

export async function shutdownBrowser() {
  try {
    if (browser) await browser.close();
  } catch {}
  browser = null;
}

// Преобразуем cookies Puppeteer в строки формата Set-Cookie (нам достаточно первой части name=value)
function toSetCookieLines(cookies) {
  try {
    return (cookies || []).map((c) => {
      const domain = c.domain || ".quicktickets.ru";
      const path = c.path || "/";
      return `${c.name}=${c.value}; Domain=${domain}; Path=${path}`;
    });
  } catch {
    return [];
  }
}

export async function collectGuestCookies(sessionUrl) {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "accept-language": "ru-RU,ru;q=0.9,en;q=0.8",
    });

    // Открываем страницу сеанса
    await page.goto(sessionUrl, {
      waitUntil: "networkidle2",
      timeout: 20000,
    });

    // Собираем cookies на базовых доменах
    const all = await page.cookies(
      "https://quicktickets.ru",
      "https://api.quicktickets.ru",
      "https://hall.quicktickets.ru"
    );

    // Возвращаем в виде строк Set-Cookie
    return toSetCookieLines(all);
  } finally {
    try {
      await page.close();
    } catch {}
  }
}

export async function collectGuestHeaders(alias, sid, userId) {
  const b = await getBrowser();
  const page = await b.newPage();
  let capturedAuth = null;
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "accept-language": "ru-RU,ru;q=0.9,en;q=0.8",
    });
    const urlHall = new URL("https://hall.quicktickets.ru/");
    urlHall.searchParams.set("scope", "qt");
    urlHall.searchParams.set("panel", "site");
    urlHall.searchParams.set("organisation_alias", alias);
    urlHall.searchParams.set("elem_type", "session");
    urlHall.searchParams.set("elem_id", sid);
    if (userId) urlHall.searchParams.set("user_id", String(userId));

    // Прямая страница сеанса. Нередко именно она инициирует первые запросы к API.
    const urlSession = `https://quicktickets.ru/${alias}/s${sid}`;

    page.on("request", (req) => {
      try {
        const u = req.url();
        if (/api\.quicktickets\.ru\/v1\//.test(u)) {
          const h = req.headers() || {};
          if (h.authorization && !capturedAuth) capturedAuth = h.authorization;
        }
      } catch {}
    });

    // Попытка 1: страница сеанса
    try {
      await page.goto(urlSession, { waitUntil: "networkidle2", timeout: 20000 });
      try {
        const req1 = await page.waitForRequest(
          (r) => /api\.quicktickets\.ru\/v1\//.test(r.url()),
          { timeout: 15000 }
        );
        const h1 = req1 && req1.headers ? req1.headers() : null;
        if (h1 && h1.authorization && !capturedAuth) capturedAuth = h1.authorization;
      } catch {}
    } catch {}

    // Попытка 2: прямая загрузка hall.quicktickets.ru, если сессия не дала заголовок
    if (!capturedAuth) {
      await page.goto(urlHall.toString(), { waitUntil: "networkidle2", timeout: 20000 });
      try {
        const req2 = await page.waitForRequest(
          (r) => /api\.quicktickets\.ru\/v1\//.test(r.url()),
          { timeout: 15000 }
        );
        const h2 = req2 && req2.headers ? req2.headers() : null;
        if (h2 && h2.authorization && !capturedAuth) capturedAuth = h2.authorization;
      } catch {}
    }

    const cookies = await page.cookies(
      "https://quicktickets.ru",
      "https://api.quicktickets.ru",
      "https://hall.quicktickets.ru"
    );
    return { setCookies: toSetCookieLines(cookies), authorization: capturedAuth };
  } finally {
    try { await page.close(); } catch {}
  }
}
