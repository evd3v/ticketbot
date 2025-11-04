const tg = window.Telegram?.WebApp;

const listEl = document.getElementById('list');
const subsEl = document.getElementById('subs');
const statusEl = document.getElementById('status');
const searchInput = document.getElementById('searchInput');
const orgFilterEl = document.getElementById('orgFilter');

const state = {
  sessions: [],
  search: '',
  orgFilter: 'all',
};

function debounce(fn, wait = 500) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function setStatus(text, type = 'info') {
  statusEl.textContent = text || '';
  statusEl.className = `status ${type}`;
}

function groupByTitle(sessions) {
  const map = new Map();
  for (const s of sessions) {
    const key = s.title || 'Спектакль';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  }
  return Array.from(map.entries()).map(([title, items]) => ({ title, items }));
}

function orgAliasOf(link = '') {
  try {
    const u = new URL(link);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[0] || 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

const ORG_LABELS = {
  'orel-teatr-svobodnoe-prostranstvo': 'Свободное пространство',
  'orel-teatr-kukol': 'Театр кукол',
};

function updateOrgFilterOptions() {
  if (!orgFilterEl) return;
  const prev = orgFilterEl.value || 'all';
  const aliases = Array.from(new Set((state.sessions || []).map(s => orgAliasOf(s.link)))).sort();
  orgFilterEl.innerHTML = '';
  const optAll = document.createElement('option');
  optAll.value = 'all';
  optAll.textContent = 'Все театры';
  orgFilterEl.appendChild(optAll);
  aliases.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = ORG_LABELS[a] || a;
    orgFilterEl.appendChild(opt);
  });
  orgFilterEl.value = aliases.includes(prev) || prev === 'all' ? prev : 'all';
  state.orgFilter = orgFilterEl.value;
}

function dateKeyRU(text = '') {
  // supports: "05 октября 18:00", "9 сентября 19:00" etc.
  const m = text.trim().toLowerCase().match(/(\d{1,2})\s+([а-яё]+)\s+(\d{1,2}):(\d{2})/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const d = parseInt(m[1], 10);
  const monWord = m[2];
  const h = parseInt(m[3], 10);
  const mm = parseInt(m[4], 10);
  const months = {
    'январ': 1, 'феврал': 2, 'март': 3, 'апрел': 4, 'мая': 5,
    'июн': 6, 'июл': 7, 'август': 8, 'сентябр': 9, 'октябр': 10, 'ноябр': 11, 'декабр': 12,
  };
  const monKey = Object.keys(months).find(k => monWord.startsWith(k));
  const mon = monKey ? months[monKey] : 12;
  return mon * 1000000 + d * 10000 + h * 100 + mm; // MMDDHHMM
}

function renderSessions(sessions) {
  listEl.innerHTML = '';

  const q = (state.search || '').trim().toLowerCase();
  const filtered = (sessions || []).filter(s => {
    const byOrg = state.orgFilter === 'all' || orgAliasOf(s.link) === state.orgFilter;
    const byTitle = !q || String(s.title || '').toLowerCase().includes(q);
    return byOrg && byTitle;
  });

  const orgMap = new Map();
  for (const s of filtered) {
    const a = orgAliasOf(s.link);
    if (!orgMap.has(a)) orgMap.set(a, []);
    orgMap.get(a).push(s);
  }

  Array.from(orgMap.entries()).forEach(([alias, items]) => {
    const boxOrg = document.createElement('details');
    boxOrg.className = 'group org';
    boxOrg.open = true;
    const countOrg = items.filter(x => x.subscribed).length;
    const label = ORG_LABELS[alias] || alias;
    boxOrg.innerHTML = `
      <summary class="group-summary">
        <span class="group-title">${label}</span>
        <span class="group-meta">${countOrg ? `подписок: ${countOrg}` : ''}</span>
      </summary>
    `;

    const innerOrg = document.createElement('div');
    innerOrg.className = 'group-items';

    const groups = groupByTitle(items);
    groups.forEach((g) => {
      const box = document.createElement('details');
      box.className = 'group';
      box.open = true;
      const count = g.items.filter(x => x.subscribed).length;
      box.innerHTML = `
        <summary class="group-summary">
          <span class="group-title">${g.title}</span>
          <span class="group-meta">${count ? `подписок: ${count}` : ''}</span>
        </summary>
      `;

      const inner = document.createElement('div');
      inner.className = 'group-items';
      const sorted = [...g.items].sort((a, b) => dateKeyRU(a.date) - dateKeyRU(b.date));
      sorted.forEach((s) => {
        const item = document.createElement('label');
        item.className = 'item';
        item.innerHTML = `
          <input type="checkbox" data-id="${s.id}" ${s.subscribed ? 'checked' : ''} />
          <div class="data">
            <div class="title">${(s.title || 'Спектакль')} — ${s.date}</div>
            <div class="link"><a href="${s.link}" target="_blank" rel="noreferrer">${s.link}</a></div>
          </div>
        `;
        inner.appendChild(item);
      });

      box.appendChild(inner);
      innerOrg.appendChild(box);
    });

    boxOrg.appendChild(innerOrg);
    listEl.appendChild(boxOrg);
  });

  // Render chips
  subsEl.innerHTML = '';
  sessions.filter(s => s.subscribed).forEach((s) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `
      <span>${s.title} — ${s.date}</span>
      <span class="x" title="Удалить">✕</span>
    `;
    chip.querySelector('.x').addEventListener('click', () => {
      // update local state
      const target = state.sessions.find(it => it.id === s.id);
      if (target) target.subscribed = false;
      // uncheck in the list and refresh UI
      const cb = listEl.querySelector(`input[data-id="${s.id}"]`);
      if (cb) cb.checked = false;
      renderSessions(state.sessions);
      queueSave();
    });
    subsEl.appendChild(chip);
  });
}

if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    state.search = e.target.value || '';
    renderSessions(state.sessions);
  });
}

if (orgFilterEl) {
  orgFilterEl.addEventListener('change', (e) => {
    state.orgFilter = e.target.value || 'all';
    renderSessions(state.sessions);
  });
}

async function loadSessions() {
  try {
    setStatus('Загрузка...', 'info');
    const initData = tg?.initData || new URLSearchParams(location.search).get('initData') || '';
    const res = await fetch(`/api/sessions?initData=${encodeURIComponent(initData)}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'API_ERROR');
    state.sessions = (json.sessions || []).map(s => ({ ...s }));
    updateOrgFilterOptions();
    renderSessions(state.sessions);
    setStatus('');
  } catch (e) {
    console.error(e);
    setStatus('Ошибка загрузки', 'error');
  }
}

async function save() {
  try {
    setStatus('Сохранение...', 'info');
    const initData = tg?.initData || new URLSearchParams(location.search).get('initData') || '';
    const checked = state.sessions.filter(s => s.subscribed).map(s => s.id);
    const res = await fetch(`/api/subscriptions?initData=${encodeURIComponent(initData)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptions: checked }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'API_ERROR');
    setStatus('Сохранено', 'success');
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
  } catch (e) {
    console.error(e);
    setStatus('Ошибка сохранения', 'error');
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
  }
}

const queueSave = debounce(save, 600);

// Delegate checkbox changes for auto-save
listEl.addEventListener('change', (e) => {
  const t = e.target;
  if (t && t.matches('input[type="checkbox"][data-id]')) {
    const id = t.dataset.id;
    const target = state.sessions.find(s => s.id === id);
    if (target) {
      target.subscribed = t.checked;
      renderSessions(state.sessions);
      queueSave();
    }
  }
});

// Unsubscribe all button
const unsubAllBtn = document.getElementById('unsubAllBtn');
if (unsubAllBtn) {
  unsubAllBtn.addEventListener('click', async () => {
    try {
      if (!confirm('Снять все подписки?')) return;
      state.sessions = state.sessions.map(s => ({ ...s, subscribed: false }));
      renderSessions(state.sessions);
      setStatus('Сохранение...', 'info');
      const initData = tg?.initData || new URLSearchParams(location.search).get('initData') || '';
      const res = await fetch(`/api/subscriptions?initData=${encodeURIComponent(initData)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptions: [] }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'API_ERROR');
      setStatus('Все подписки сняты', 'success');
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } catch (e) {
      console.error(e);
      setStatus('Ошибка снятия подписок', 'error');
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    }
  });
}

if (tg) {
  tg.ready();
  tg.expand?.();
}

loadSessions();
