// ── APP.JS ─────────────────────────────────────────
'use strict';

// ── STATE ───────────────────────────────────────────
const state = {
  entries: [],
  filter: 'all',
  search: '',
  editId: null,
  currentType: 'inspection',
  currentPriority: 'normal',
  photoData: null,
  geoCoords: null,
};

// ── ELEMENTS ────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const views        = { home: $('view-home'), form: $('view-form'), detail: $('view-detail'), stats: $('view-stats') };
const logList      = $('log-list');
const emptyState   = $('empty-state');
const searchInput  = $('search-input');
const liveTime     = $('live-time');
const toast        = $('toast');
const tagSugg      = $('tag-suggestions');

// ── UTILS ───────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + '  ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtRelative(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7)  return `${d}d ago`;
  return fmtDate(ts).split('  ')[0];
}

function showToast(msg, duration = 2000) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

function showView(name) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  if (views[name]) views[name].classList.add('active');
  // hide/show nav for form/detail
  const hideNav = name === 'form' || name === 'detail';
  $('bottom-nav').style.display = hideNav ? 'none' : '';
  // sync nav buttons
  $$('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name);
  });
  window.scrollTo(0, 0);
}

// ── CLOCK ───────────────────────────────────────────
function tickClock() {
  const now = new Date();
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const day  = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  liveTime.textContent = `${day}  ${time}`;
}
setInterval(tickClock, 1000);
tickClock();

// ── RENDER LOG LIST ─────────────────────────────────
function filterEntries() {
  let list = state.entries;
  if (state.filter !== 'all') list = list.filter(e => e.type === state.filter);
  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    list = list.filter(e =>
      e.tag.toLowerCase().includes(q) ||
      (e.location || '').toLowerCase().includes(q) ||
      (e.note || '').toLowerCase().includes(q)
    );
  }
  return list;
}

function renderList() {
  const items = filterEntries();
  emptyState.style.display = items.length ? 'none' : 'block';

  // remove old cards
  $$('.log-card').forEach(c => c.remove());

  items.forEach(entry => {
    const card = document.createElement('div');
    card.className = `log-card priority-${entry.priority}`;
    card.dataset.id = entry.id;

    const hasReadings = entry.readings && Object.values(entry.readings).some(v => v !== '' && v !== null);
    const readingsPill = hasReadings
      ? `<span class="card-readings-pill">⚡ readings</span>`
      : '';
    const photoFlag = entry.photo ? `<span class="card-photo-flag">📷</span>` : '';

    card.innerHTML = `
      <div class="card-top">
        <span class="card-tag">${entry.tag || '—'}</span>
        <span class="card-type-badge">${entry.type}</span>
      </div>
      <div class="card-note">${entry.note || '<em style="color:var(--text-3)">No notes.</em>'}</div>
      <div class="card-meta">
        <span>${fmtRelative(entry.ts)}</span>
        ${entry.location ? `<span>· ${entry.location}</span>` : ''}
        ${readingsPill}
        ${photoFlag}
      </div>
    `;
    card.addEventListener('click', () => openDetail(entry.id));
    logList.appendChild(card);
  });
}

// ── TAG SUGGESTIONS ─────────────────────────────────
function rebuildSuggestions() {
  const tags = [...new Set(state.entries.map(e => e.tag).filter(Boolean))].sort();
  tagSugg.innerHTML = tags.map(t => `<option value="${t}">`).join('');
}

// ── LOAD DATA ───────────────────────────────────────
async function loadEntries() {
  state.entries = await DB.getAll();
  renderList();
  rebuildSuggestions();
}

// ── FORM ────────────────────────────────────────────
function openForm(editId = null) {
  state.editId    = editId;
  state.photoData = null;
  state.geoCoords = null;

  $('form-title').textContent = editId ? 'Edit Entry' : 'New Entry';

  // reset
  $$('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'inspection'));
  $$('.priority-btn').forEach(b => b.classList.toggle('active', b.dataset.priority === 'normal'));
  state.currentType     = 'inspection';
  state.currentPriority = 'normal';
  $('f-tag').value       = '';
  $('f-location').value  = '';
  $('f-note').value      = '';
  $('r-current').value   = '';
  $('r-temp').value      = '';
  $('r-vibration').value = '';
  $('r-hours').value     = '';
  $('f-geo').checked     = false;
  $('geo-status').textContent = '';
  $('geo-status').className   = 'geo-status';
  $('photo-preview').classList.add('hidden');
  $('btn-remove-photo').classList.add('hidden');
  $('f-photo').value = '';

  if (editId) {
    const e = state.entries.find(x => x.id === editId);
    if (e) {
      $('f-tag').value      = e.tag || '';
      $('f-location').value = e.location || '';
      $('f-note').value     = e.note || '';
      setType(e.type);
      setPriority(e.priority);
      if (e.readings) {
        $('r-current').value   = e.readings.current   || '';
        $('r-temp').value      = e.readings.temp      || '';
        $('r-vibration').value = e.readings.vibration || '';
        $('r-hours').value     = e.readings.hours     || '';
      }
      if (e.photo) {
        state.photoData = e.photo;
        $('photo-preview').src = e.photo;
        $('photo-preview').classList.remove('hidden');
        $('btn-remove-photo').classList.remove('hidden');
      }
      if (e.geo) {
        state.geoCoords = e.geo;
        $('f-geo').checked = true;
        $('geo-status').textContent = `${e.geo.lat.toFixed(5)}, ${e.geo.lng.toFixed(5)}`;
        $('geo-status').className   = 'geo-status ok';
      }
    }
  }

  showView('form');
}

function setType(t) {
  state.currentType = t;
  $$('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === t));
}
function setPriority(p) {
  state.currentPriority = p;
  $$('.priority-btn').forEach(b => b.classList.toggle('active', b.dataset.priority === p));
}

async function saveEntry() {
  const tag = $('f-tag').value.trim();
  if (!tag) { showToast('Motor tag is required.'); $('f-tag').focus(); return; }

  const entry = {
    id:       state.editId || uid(),
    ts:       state.editId ? (state.entries.find(e => e.id === state.editId)?.ts || Date.now()) : Date.now(),
    updatedTs: Date.now(),
    type:     state.currentType,
    priority: state.currentPriority,
    tag,
    location: $('f-location').value.trim(),
    note:     $('f-note').value.trim(),
    readings: {
      current:   $('r-current').value   !== '' ? parseFloat($('r-current').value)   : null,
      temp:      $('r-temp').value      !== '' ? parseFloat($('r-temp').value)      : null,
      vibration: $('r-vibration').value !== '' ? parseFloat($('r-vibration').value) : null,
      hours:     $('r-hours').value     !== '' ? parseFloat($('r-hours').value)     : null,
    },
    photo: state.photoData || null,
    geo:   state.geoCoords || null,
  };

  await DB.save(entry);

  // update state
  const idx = state.entries.findIndex(e => e.id === entry.id);
  if (idx >= 0) state.entries[idx] = entry;
  else state.entries.unshift(entry);

  rebuildSuggestions();
  renderList();
  showView('home');
  showToast(state.editId ? 'Entry updated.' : 'Entry saved.');
}

// ── GEO ─────────────────────────────────────────────
$('f-geo').addEventListener('change', function() {
  if (!this.checked) {
    state.geoCoords = null;
    $('geo-status').textContent = '';
    $('geo-status').className   = 'geo-status';
    return;
  }
  if (!navigator.geolocation) {
    $('geo-status').textContent = 'Geolocation not available.';
    $('geo-status').className   = 'geo-status err';
    this.checked = false;
    return;
  }
  $('geo-status').textContent = 'Acquiring location…';
  navigator.geolocation.getCurrentPosition(
    pos => {
      state.geoCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
      $('geo-status').textContent = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      $('geo-status').className   = 'geo-status ok';
    },
    err => {
      $('geo-status').textContent = 'Location access denied.';
      $('geo-status').className   = 'geo-status err';
      $('f-geo').checked = false;
    },
    { timeout: 10000 }
  );
});

// ── PHOTO ────────────────────────────────────────────
$('f-photo').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    state.photoData = e.target.result;
    $('photo-preview').src = e.target.result;
    $('photo-preview').classList.remove('hidden');
    $('btn-remove-photo').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

$('btn-remove-photo').addEventListener('click', () => {
  state.photoData = null;
  $('f-photo').value = '';
  $('photo-preview').classList.add('hidden');
  $('btn-remove-photo').classList.add('hidden');
});

// ── DETAIL VIEW ─────────────────────────────────────
let detailId = null;

async function openDetail(id) {
  detailId = id;
  const e = await DB.get(id);
  if (!e) return;

  const hasReadings = e.readings && Object.values(e.readings).some(v => v !== null && v !== '');
  const readingsHtml = hasReadings ? `
    <div class="detail-section">
      <div class="detail-section-title">Readings</div>
      <div class="readings-display">
        ${e.readings.current   !== null ? `<div class="reading-item"><span class="r-label">Current (A)</span><span class="r-val">${e.readings.current}</span></div>` : ''}
        ${e.readings.temp      !== null ? `<div class="reading-item"><span class="r-label">Temp (°C)</span><span class="r-val">${e.readings.temp}</span></div>` : ''}
        ${e.readings.vibration !== null ? `<div class="reading-item"><span class="r-label">Vibration</span><span class="r-val">${e.readings.vibration}</span></div>` : ''}
        ${e.readings.hours     !== null ? `<div class="reading-item"><span class="r-label">Hours Run</span><span class="r-val">${e.readings.hours}</span></div>` : ''}
      </div>
    </div>` : '';

  const noteHtml = e.note ? `
    <div class="detail-section">
      <div class="detail-section-title">Notes</div>
      <div class="detail-note">${e.note}</div>
    </div>` : '';

  const photoHtml = e.photo ? `
    <div class="detail-section">
      <div class="detail-section-title">Photo</div>
      <img src="${e.photo}" class="detail-photo" alt="Entry photo" />
    </div>` : '';

  const geoHtml = e.geo ? `
    <div class="detail-section">
      <div class="detail-section-title">Location</div>
      <div class="detail-geo">
        ${e.geo.lat.toFixed(6)}, ${e.geo.lng.toFixed(6)}
        <br/><span style="color:var(--text-3)">Accuracy: ±${Math.round(e.geo.acc)}m</span>
        <br/><a href="https://maps.google.com/?q=${e.geo.lat},${e.geo.lng}" target="_blank"
           style="color:var(--accent);font-weight:500;font-size:0.8rem;">Open in Maps ↗</a>
      </div>
    </div>` : '';

  const priorityLabels = { normal: '', watch: ' · Watch', urgent: ' · URGENT' };

  $('detail-content').innerHTML = `
    <span class="detail-type-badge">${e.type}${priorityLabels[e.priority] || ''}</span>
    <div class="detail-tag">${e.tag}</div>
    ${e.location ? `<div class="detail-location">📍 ${e.location}</div>` : ''}
    <div class="detail-meta">
      <span>${fmtDate(e.ts)}</span>
      ${e.updatedTs && e.updatedTs !== e.ts ? `<span>· Edited ${fmtRelative(e.updatedTs)}</span>` : ''}
    </div>
    ${readingsHtml}
    ${noteHtml}
    ${photoHtml}
    ${geoHtml}
  `;

  showView('detail');
}

// ── SHARE ────────────────────────────────────────────
$('btn-share-entry').addEventListener('click', async () => {
  if (!detailId) return;
  const e = await DB.get(detailId);
  if (!e) return;

  const lines = [
    `Field Entry — ${e.type.toUpperCase()}`,
    `Motor: ${e.tag}`,
    e.location ? `Location: ${e.location}` : '',
    `Date: ${fmtDate(e.ts)}`,
    '',
    e.note ? e.note : '',
    '',
    e.readings ? [
      e.readings.current   !== null ? `Current: ${e.readings.current} A`   : '',
      e.readings.temp      !== null ? `Temp: ${e.readings.temp} °C`        : '',
      e.readings.vibration !== null ? `Vibration: ${e.readings.vibration}` : '',
      e.readings.hours     !== null ? `Hours: ${e.readings.hours}`         : '',
    ].filter(Boolean).join('\n') : '',
    '',
    e.geo ? `GPS: ${e.geo.lat.toFixed(6)}, ${e.geo.lng.toFixed(6)}` : '',
  ].filter(l => l !== undefined).join('\n').trim();

  if (navigator.share) {
    navigator.share({ title: `Field — ${e.tag}`, text: lines }).catch(() => {});
  } else {
    navigator.clipboard.writeText(lines).then(() => showToast('Copied to clipboard.'));
  }
});

// ── DELETE ───────────────────────────────────────────
$('btn-delete-entry').addEventListener('click', () => {
  if (!detailId) return;
  const e = state.entries.find(x => x.id === detailId);
  $('modal-message').textContent = `Delete entry for "${e?.tag || 'this entry'}"? This cannot be undone.`;
  $('modal-overlay').classList.remove('hidden');
});

$('modal-confirm').addEventListener('click', async () => {
  $('modal-overlay').classList.add('hidden');
  if (!detailId) return;
  await DB.delete(detailId);
  state.entries = state.entries.filter(e => e.id !== detailId);
  renderList();
  showView('home');
  showToast('Entry deleted.');
});

$('modal-cancel').addEventListener('click', () => {
  $('modal-overlay').classList.add('hidden');
});

// ── STATS VIEW ───────────────────────────────────────
function renderStats() {
  const all = state.entries;
  const byType = { inspection: 0, maintenance: 0, fault: 0, reading: 0 };
  const byPriority = { normal: 0, watch: 0, urgent: 0 };
  const tagCounts = {};

  all.forEach(e => {
    if (byType[e.type] !== undefined) byType[e.type]++;
    if (byPriority[e.priority] !== undefined) byPriority[e.priority]++;
    tagCounts[e.tag] = (tagCounts[e.tag] || 0) + 1;
  });

  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const recent = all.slice(0, 5);

  $('stats-content').innerHTML = `
    <div class="stat-card">
      <div class="stat-card-title">Total Entries</div>
      <div class="stat-number-row">
        <div><div class="stat-num">${all.length}</div><div class="stat-lbl">Total</div></div>
        <div><div class="stat-num">${byType.inspection}</div><div class="stat-lbl">Inspect</div></div>
        <div><div class="stat-num">${byType.maintenance}</div><div class="stat-lbl">Maint.</div></div>
        <div><div class="stat-num">${byType.fault}</div><div class="stat-lbl">Faults</div></div>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-card-title">By Priority</div>
      <div class="stat-number-row">
        <div><div class="stat-num accent">${byPriority.normal}</div><div class="stat-lbl">Normal</div></div>
        <div><div class="stat-num watch">${byPriority.watch}</div><div class="stat-lbl">Watch</div></div>
        <div><div class="stat-num urgent">${byPriority.urgent}</div><div class="stat-lbl">Urgent</div></div>
        <div><div class="stat-num">${byType.reading}</div><div class="stat-lbl">Readings</div></div>
      </div>
    </div>

    ${topTags.length ? `
    <div class="stat-card">
      <div class="stat-card-title">Top Equipment</div>
      <div class="tag-list">
        ${topTags.map(([tag, count]) =>
          `<div class="tag-item">${tag} <span class="tag-count">${count}</span></div>`
        ).join('')}
      </div>
    </div>` : ''}

    ${recent.length ? `
    <div class="stat-card">
      <div class="stat-card-title">Recent Activity</div>
      <div class="recent-list">
        ${recent.map(e => `
          <div class="recent-item" style="cursor:pointer" onclick="openDetail('${e.id}')">
            <div>
              <div class="recent-tag">${e.tag}</div>
              <div style="font-size:0.75rem;color:var(--text-3)">${e.type}${e.location ? ' · ' + e.location : ''}</div>
            </div>
            <span class="recent-time">${fmtRelative(e.ts)}</span>
          </div>
        `).join('')}
      </div>
    </div>` : ''}
  `;
}

// ── CSV EXPORT ───────────────────────────────────────
$('btn-export').addEventListener('click', () => {
  if (!state.entries.length) { showToast('No entries to export.'); return; }
  const headers = ['Date', 'Type', 'Priority', 'Tag', 'Location', 'Note', 'Current(A)', 'Temp(C)', 'Vibration', 'Hours', 'Lat', 'Lng'];
  const rows = state.entries.map(e => [
    fmtDate(e.ts),
    e.type,
    e.priority,
    e.tag,
    e.location || '',
    (e.note || '').replace(/,/g, ';').replace(/\n/g, ' '),
    e.readings?.current   ?? '',
    e.readings?.temp      ?? '',
    e.readings?.vibration ?? '',
    e.readings?.hours     ?? '',
    e.geo?.lat ?? '',
    e.geo?.lng ?? '',
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `field-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported.');
});

// ── WIRE UP BUTTONS ──────────────────────────────────
$('btn-new-entry').addEventListener('click', () => openForm());
$('btn-back').addEventListener('click', () => { showView('home'); renderList(); });
$('btn-detail-back').addEventListener('click', () => { showView('home'); renderList(); });
$('btn-save').addEventListener('click', saveEntry);
$('btn-cancel-form').addEventListener('click', () => showView('home'));

// Type selector
$$('.type-btn').forEach(b => {
  b.addEventListener('click', () => setType(b.dataset.type));
});

// Priority selector
$$('.priority-btn').forEach(b => {
  b.addEventListener('click', () => setPriority(b.dataset.priority));
});

// Filter chips
$$('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    $$('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.filter = chip.dataset.filter;
    renderList();
  });
});

// Search
searchInput.addEventListener('input', () => {
  state.search = searchInput.value;
  renderList();
});

// Bottom nav
$$('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    if (view === 'stats') renderStats();
    showView(view);
  });
});

// ── INIT ─────────────────────────────────────────────
loadEntries();
