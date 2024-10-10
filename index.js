import axios from "axios";
import TeleBot from "telebot";

const TELEGRAM_BOT_TOKEN = "7779682896:AAGCT0knRD9IzLJB6tArnFmRHP8R7yirwoc";

const ADMIN_CHAT_ID = 875484579
const ANGEL_CHAT_ID = 384686618


const SESSIONS = [
  {id: '2440', date: '23 октября 19:00', link: 'https://quicktickets.ru/orel-teatr-svobodnoe-prostranstvo/s2440'},
  // {id: '2439', date: '10 октября 19:00', link: 'https://quicktickets.ru/orel-teatr-svobodnoe-prostranstvo/s2439'},
  // {id: '2438', date: '09 октября 19:00', link: 'https://quicktickets.ru/orel-teatr-svobodnoe-prostranstvo/s2438'},
  {id: '2491', date: '13 ноября 19:00', link: 'https://quicktickets.ru/orel-teatr-svobodnoe-prostranstvo/s2491'},
  {id: '2492', date: '14 ноября 19:00', link: 'https://quicktickets.ru/orel-teatr-svobodnoe-prostranstvo/s2492'},
]

const getPlaces = async (id) => {
  try {
    const response = await axios.get('https://api.quicktickets.ru/v1/anyticket/anyticket', {
      params: {
        scope: 'qt',
        panel: 'site',
        user_id: '0',
        organisation_alias: 'orel-teatr-svobodnoe-prostranstvo',
        elem_type: 'session',
        elem_id: id
      },
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'ru,en-US;q=0.9,en;q=0.8,ru-RU;q=0.7',
        'api-id': 'quick-tickets',
        'authorization': 'Basic NTA3MDRlY2RhOGViMzc3M2UzMjBjY2NkZjU0ZDM0NWQyNTIxZmMyNjhhNGM3OGM2MDJkM2ZhNWRmMmMyMDAwNA==',
        'cache-control': 'no-cache',
        'origin': 'https://hall.quicktickets.ru',
        'pragma': 'no-cache',
        'priority': 'u=1, i',
        'referer': 'https://hall.quicktickets.ru/',
        'sec-ch-ua': '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
      }
    });

    return response.data;
  } catch (e) {
    console.error('Error:', e);
  }
};

const getHallData = async (id) => {
  try {
    const response = await axios.get('https://api.quicktickets.ru/v1/hall/hall', {
      params: {
        scope: 'qt',
        panel: 'site',
        user_id: '0',
        organisation_alias: 'orel-teatr-svobodnoe-prostranstvo',
        elem_type: 'session',
        elem_id: id
      },
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'ru,en-US;q=0.9,en;q=0.8,ru-RU;q=0.7',
        'api-id': 'quick-tickets',
        'authorization': 'Basic NTA3MDRlY2RhOGViMzc3M2UzMjBjY2NkZjU0ZDM0NWQyNTIxZmMyNjhhNGM3OGM2MDJkM2ZhNWRmMmMyMDAwNA==',
        'cache-control': 'no-cache',
        'origin': 'https://hall.quicktickets.ru',
        'pragma': 'no-cache',
        'priority': 'u=1, i',
        'referer': 'https://hall.quicktickets.ru/',
        'sec-ch-ua': '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error:', error);
  }
};


const bot = new TeleBot({
  token: TELEGRAM_BOT_TOKEN, // Required. Telegram Bot API token.
});


setInterval(async () => {
  for await (let session of SESSIONS) {
    const { response: { places } } = await getPlaces(session.id);

    const { response: { places: hallPlaces }  } = await getHallData(session.id)

    const placesKeys = Object.keys(places);
    const hallPlacesKeys = Object.keys(hallPlaces);

    const availablePlacesKeys = hallPlacesKeys.filter(key => !placesKeys.includes(key));

    if(availablePlacesKeys.length > 0) {
      bot.sendMessage(ANGEL_CHAT_ID, `На сеанс ${session.date} есть ${availablePlacesKeys.length} доступных мест!\nСсылка на покупку: ${session.link}`)
      bot.sendMessage(ADMIN_CHAT_ID, `На сеанс ${session.date} есть ${availablePlacesKeys.length} доступных мест!\nСсылка на покупку: ${session.link}`)
    }
  }
}, 60000)


bot.sendMessage(ADMIN_CHAT_ID, 'Опрос запущен!')

// setInterval(() => {
//   bot.sendMessage(ADMIN_CHAT_ID, 'Опрос идет, все ок!')
// }, 60000 * 60)



bot.start();
