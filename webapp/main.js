const tg = window.Telegram?.WebApp;

const listEl = document.getElementById('list');
const subsEl = document.getElementById('subs');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');

function setStatus(text, type = 'info') {
  statusEl.textContent = text || '';
  statusEl.className = `status ${type}`;
}

function renderSessions(sessions) {
  listEl.innerHTML = '';

  sessions.forEach((s) => {
    const item = document.createElement('label');
    item.className = 'item';
    item.innerHTML = `
      <input type="checkbox" data-id="${s.id}" ${s.subscribed ? 'checked' : ''} />
      <div class="data">
        <div class="title">${(s.title || 'Спектакль')} — ${s.date}</div>
        <div class="link"><a href="${s.link}" target="_blank" rel="noreferrer">${s.link}</a></div>
      </div>
    `;
    listEl.appendChild(item);
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
      // uncheck in the list and refresh chips
      const cb = listEl.querySelector(`input[data-id="${s.id}"]`);
      if (cb) cb.checked = false;
      // update local state
      const updated = sessions.map(item => item.id === s.id ? { ...item, subscribed: false } : item);
      renderSessions(updated);
    });
    subsEl.appendChild(chip);
  });
}

async function loadSessions() {
  try {
    setStatus('Загрузка...', 'info');
    const initData = tg?.initData || new URLSearchParams(location.search).get('initData') || '';
    const res = await fetch(`/api/sessions?initData=${encodeURIComponent(initData)}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'API_ERROR');
    renderSessions(json.sessions || []);
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
    const checked = Array.from(listEl.querySelectorAll('input[type="checkbox"]:checked')).map((el) => el.dataset.id);
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

saveBtn.addEventListener('click', save);

if (tg) {
  tg.ready();
  tg.expand?.();
}

loadSessions();
