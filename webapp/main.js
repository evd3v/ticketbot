const tg = window.Telegram?.WebApp;

const listEl = document.getElementById('list');
const subsEl = document.getElementById('subs');
const statusEl = document.getElementById('status');
const searchEl = document.getElementById('search');
const orgFiltersEl = document.getElementById('orgFilters');

const state = {
  sessions: [],
  filters: {
    search: '',
    orgs: new Set(),
  },
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

function extractOrg(link = '') {
  try {
    const m = String(link).match(/quicktickets\.ru\/([^/]+)/i);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

function applyFilters(sessions) {
  const q = (state.filters.search || '').trim().toLowerCase();
  const selected = state.filters.orgs;
  return sessions.filter((s) => {
    const title = String(s.title || '').toLowerCase();
    const org = extractOrg(s.link);
    const byTitle = !q || title.includes(q);
    const byOrg = selected.size === 0 || selected.has(org);
    return byTitle && byOrg;
  });
}

function renderOrgFilters(sessions) {
  if (!orgFiltersEl) return;
  const orgs = Array.from(new Set((sessions || []).map(s => extractOrg(s.link)).filter(Boolean))).sort();
  orgFiltersEl.innerHTML = '';
  orgs.forEach((org) => {
    const active = state.filters.orgs.has(org);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.org = org;
    btn.className = [
      'px-3 py-1 rounded-full border text-sm',
      active ? 'bg-blue-600 text-white border-transparent' : 'bg-white text-gray-700 border-gray-300'
    ].join(' ');
    btn.textContent = org;
    orgFiltersEl.appendChild(btn);
  });
}

function openLink(url) {
  try {
    if (tg?.openLink) tg.openLink(url);
    else window.open(url, '_blank', 'noopener');
  } catch (e) {
    console.error(e);
  }
}

function renderSessions(sessions) {
  listEl.innerHTML = '';

  const filtered = applyFilters(sessions);
  const groups = groupByTitle(filtered);
  groups.forEach((g) => {
    const box = document.createElement('details');
    box.className = 'rounded-lg border overflow-hidden';
    box.open = true;
    const count = g.items.filter(x => x.subscribed).length;
    box.innerHTML = `
      <summary class="flex items-center justify-between bg-gray-50 px-3 py-2 cursor-pointer">
        <span class="font-medium">${g.title}</span>
        <span class="text-xs text-gray-500">${count ? `подписок: ${count}` : ''}</span>
      </summary>
    `;

    const inner = document.createElement('div');
    inner.className = 'flex flex-col gap-2 p-2';
    const sorted = [...g.items].sort((a, b) => dateKeyRU(a.date) - dateKeyRU(b.date));
    sorted.forEach((s) => {
      const org = extractOrg(s.link) || '';
      const item = document.createElement('label');
      item.className = 'flex items-start gap-3 rounded-lg border p-3 hover:bg-slate-50 cursor-pointer';
      item.dataset.link = s.link;
      item.innerHTML = `
        <input class="mt-1" type="checkbox" data-id="${s.id}" ${s.subscribed ? 'checked' : ''} />
        <div class="data grow" data-link="${s.link}">
          <div class="text-sm font-medium">${(s.title || 'Спектакль')} — ${s.date}</div>
          <div class="text-xs text-gray-500">${org}</div>
        </div>
      `;
      inner.appendChild(item);
    });

    box.appendChild(inner);
    listEl.appendChild(box);
  });

  subsEl.innerHTML = '';
  const subs = sessions.filter(s => s.subscribed);
  if (subs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'text-xs text-gray-400';
    empty.textContent = 'Нет активных подписок';
    subsEl.appendChild(empty);
  } else {
    subs.forEach((s) => {
      const card = document.createElement('div');
      card.className = 'flex items-center justify-between rounded-lg border p-2 gap-3';
      card.innerHTML = `
        <div class="min-w-0">
          <div class="truncate text-sm font-medium">${s.title}</div>
          <div class="text-xs text-gray-500">${s.date}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button class="open px-2 py-1 text-xs rounded border border-gray-300" data-link="${s.link}">Открыть</button>
          <button class="remove px-2 py-1 text-xs rounded border border-red-600 text-red-700" data-id="${s.id}">Убрать</button>
        </div>
      `;
      card.querySelector('.open')?.addEventListener('click', () => openLink(s.link));
      card.querySelector('.remove')?.addEventListener('click', () => {
        const target = state.sessions.find(it => it.id === s.id);
        if (target) target.subscribed = false;
        const cb = listEl.querySelector(`input[data-id="${s.id}"]`);
        if (cb) cb.checked = false;
        renderSessions(state.sessions);
        queueSave();
      });
      subsEl.appendChild(card);
    });
  }
}

async function loadSessions() {
  try {
    setStatus('Загрузка...', 'info');
    const initData = tg?.initData || new URLSearchParams(location.search).get('initData') || '';
    const res = await fetch(`/api/sessions?initData=${encodeURIComponent(initData)}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'API_ERROR');
    state.sessions = (json.sessions || []).map(s => ({ ...s }));
    renderOrgFilters(state.sessions);
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

// Open link on item click (except checkbox)
listEl.addEventListener('click', (e) => {
  const isCheckbox = e.target && e.target.matches('input[type="checkbox"][data-id]');
  if (isCheckbox) return;
  const node = e.target.closest('.data[data-link], label[data-link]');
  const url = node?.dataset?.link;
  if (url) {
    e.preventDefault();
    e.stopPropagation();
    openLink(url);
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

// Filter by theatre (toggle buttons)
if (orgFiltersEl) {
  orgFiltersEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-org]');
    if (!btn) return;
    const org = btn.dataset.org;
    if (state.filters.orgs.has(org)) state.filters.orgs.delete(org);
    else state.filters.orgs.add(org);
    renderOrgFilters(state.sessions);
    renderSessions(state.sessions);
  });
}

// Search by title
if (searchEl) {
  searchEl.addEventListener('input', debounce((e) => {
    state.filters.search = (e.target?.value || '').trim();
    renderSessions(state.sessions);
  }, 200));
}

if (tg) {
  tg.ready();
  tg.expand?.();
}

loadSessions();
