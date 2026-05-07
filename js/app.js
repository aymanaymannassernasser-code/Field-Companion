// ── APP.JS ─────────────────────────────────────────
'use strict';

// ── SEED DATA (bundled from Excel) ──────────────────
// Loaded from motors_data.json via fetch on init
let SEED_MOTORS = [];

// ── STATE ───────────────────────────────────────────
const S = {
  motors:       [],   // all motors from DB
  rounds:       [],   // all rounds from DB
  motorFilter:  'all',
  motorSearch:  '',
  currentMotorTag: null,
  currentRoundId: null,

  // Round builder
  round: {
    id: null,
    date: '',
    tech: '',
    notes: '',
    readings: {},   // tag -> {current, tempDE, tempNDE, noise, hrMeter, counterRepeats, notes}
    greased: {},    // tag -> true/false
  },
};

// ── UTILS ────────────────────────────────────────────
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,5); }

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateShort(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function showToast(msg, dur = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur);
}

// ── VIEW ROUTING ─────────────────────────────────────
const NAV_VIEWS = ['dash', 'motors']; // views with bottom nav
function showView(name) {
  $$('.view').forEach(v => v.classList.remove('active'));
  const v = $('view-' + name);
  if (v) v.classList.add('active');
  const hasNav = NAV_VIEWS.includes(name);
  $('bottom-nav').style.display = hasNav ? '' : 'none';
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  window.scrollTo(0, 0);
}

// ── CLOCK ─────────────────────────────────────────────
function tickClock() {
  const n = new Date();
  $('live-time').textContent =
    n.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })
    + '  ' + n.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
}
setInterval(tickClock, 1000); tickClock();

// ── GREASING LOGIC ────────────────────────────────────
function computeGreaseStatus(motor) {
  // Action 1: hours since last greasing >= interval
  const interval = parseFloat(motor.greaseInterval) || 0;
  const diff = motor.hrsSinceLastGrease;
  const a1 = interval > 0 && diff !== null && diff >= interval;

  // Action 2: 365+ days since last greasing date
  const days = daysSince(motor.dateLastGrease);
  const a2 = days !== null && days >= 365;

  return { a1, a2, needsGrease: a1 || a2, days, diff, interval };
}

function greaseStatusLabel(motor) {
  const { a1, a2, needsGrease } = computeGreaseStatus(motor);
  if (!motor.requiresGreasing || motor.requiresGreasing.toLowerCase() !== 'yes') return null;
  if (a1) return { label: 'Action 1', cls: 'urgent', reason: `${motor.hrsSinceLastGrease?.toLocaleString() || '?'} hrs since last grease (interval: ${motor.greaseInterval})` };
  if (a2) return { label: 'Action 2', cls: 'watch', reason: `${daysSince(motor.dateLastGrease)} days since last grease` };
  return null;
}

// ── DASHBOARD ─────────────────────────────────────────
function renderDash() {
  const motors = S.motors;
  const rounds = S.rounds;

  $('dash-subtitle').textContent = `${motors.length} motors · Plant 1`;

  // Alerts
  const alertStrip = $('alert-strip');
  alertStrip.innerHTML = '';
  const urgent = motors.filter(m => computeGreaseStatus(m).a1 && m.requiresGreasing === 'Yes');
  const watch  = motors.filter(m => !computeGreaseStatus(m).a1 && computeGreaseStatus(m).a2 && m.requiresGreasing === 'Yes');
  if (urgent.length) {
    const a = document.createElement('div');
    a.className = 'alert-card';
    a.textContent = `⚠ ${urgent.length} motor${urgent.length>1?'s':''} need greasing now (Action 1 — hours reached)`;
    alertStrip.appendChild(a);
  }
  if (watch.length) {
    const a = document.createElement('div');
    a.className = 'alert-card watch';
    a.textContent = `⏱ ${watch.length} motor${watch.length>1?'s':''} due by date (Action 2 — 12-month interval)`;
    alertStrip.appendChild(a);
  }

  // Stats
  const stats = [
    { num: motors.length, lbl: 'Motors', cls: '' },
    { num: urgent.length + watch.length, lbl: 'Grease Due', cls: urgent.length ? 'urgent' : watch.length ? 'watch' : '' },
    { num: rounds.length, lbl: 'Rounds', cls: 'accent' },
  ];
  $('dash-stats').innerHTML = stats.map(s => `
    <div class="stat-tile">
      <div class="stat-tile-num ${s.cls}">${s.num}</div>
      <div class="stat-tile-lbl">${s.lbl}</div>
    </div>`).join('');

  // Grease due list (top 8)
  const dueMotors = motors
    .filter(m => m.requiresGreasing === 'Yes' && (computeGreaseStatus(m).a1 || computeGreaseStatus(m).a2))
    .sort((a,b) => {
      const sa = computeGreaseStatus(a), sb = computeGreaseStatus(b);
      if (sa.a1 !== sb.a1) return sb.a1 - sa.a1;
      return (sb.diff||0) - (sa.diff||0);
    })
    .slice(0, 8);

  const gdb = $('grease-due-block');
  const gdl = $('grease-due-list');
  if (!dueMotors.length) {
    gdb.style.display = 'none';
  } else {
    gdb.style.display = '';
    gdl.innerHTML = dueMotors.map(m => {
      const s = computeGreaseStatus(m);
      const cls = s.a1 ? 'a1' : 'a2';
      const lbl = s.a1 ? 'Action 1' : 'Action 2';
      const reason = s.a1
        ? `${(m.hrsSinceLastGrease||0).toLocaleString()} / ${(m.greaseInterval||'?')} hrs`
        : `${s.days} days since ${fmtDateShort(m.dateLastGrease)}`;
      return `<div class="grease-due-card" onclick="openMotorDetail('${m.tag}')">
        <div class="gdc-tag">${m.tag}</div>
        <div class="gdc-reason">${m.description ? m.description.slice(0,40) : ''}<br/>${reason}</div>
        <div class="gdc-badge ${cls}">${lbl}</div>
      </div>`;
    }).join('');
  }

  // Recent rounds
  const rrb = $('recent-rounds-block');
  const rrl = $('recent-rounds-list');
  if (!rounds.length) {
    rrb.style.display = 'none';
  } else {
    rrb.style.display = '';
    rrl.innerHTML = rounds.slice(0,5).map(r => {
      const nReadings = Object.keys(r.readings || {}).length;
      const nGreased  = Object.values(r.greased || {}).filter(Boolean).length;
      return `<div class="round-card" onclick="openRoundDetail('${r.id}')">
        <div class="round-card-left">
          <div class="round-card-date">${fmtDate(r.date)}</div>
          <div class="round-card-meta">${r.tech ? r.tech + ' · ' : ''}${nReadings} readings · ${nGreased} greased</div>
        </div>
        <div class="round-card-right">${r.notes ? r.notes.slice(0,30) + '…' : ''}</div>
      </div>`;
    }).join('');
  }
}

// ── MOTORS LIST ───────────────────────────────────────
function filterMotors() {
  let list = S.motors;
  if (S.motorFilter === 'grease-due') {
    list = list.filter(m => m.requiresGreasing === 'Yes' && (computeGreaseStatus(m).a1 || computeGreaseStatus(m).a2));
  } else if (S.motorFilter !== 'all') {
    list = list.filter(m => m.area === S.motorFilter);
  }
  if (S.motorSearch.trim()) {
    const q = S.motorSearch.toLowerCase();
    list = list.filter(m =>
      (m.tag||'').toLowerCase().includes(q) ||
      (m.description||'').toLowerCase().includes(q) ||
      (m.area||'').toLowerCase().includes(q) ||
      (m.manufacturer||'').toLowerCase().includes(q)
    );
  }
  return list;
}

function renderMotorList() {
  const motors = filterMotors();
  const list = $('motor-list');

  // Update chip counts
  const greaseDue = S.motors.filter(m => m.requiresGreasing === 'Yes' && (computeGreaseStatus(m).a1 || computeGreaseStatus(m).a2)).length;
  $('chip-all').textContent = S.motors.length;
  $('chip-grease').textContent = greaseDue || '';

  if (!motors.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">⚙</div><p>No motors match.</p></div>`;
    return;
  }
  list.innerHTML = motors.map(m => {
    const gs = greaseStatusLabel(m);
    const cardCls = gs ? (gs.cls === 'urgent' ? 'grease-due' : 'grease-watch') : '';
    const badge = gs ? `<span class="motor-badge ${gs.cls}">${gs.label}</span>` : '';
    return `<div class="motor-card ${cardCls}" onclick="openMotorDetail('${m.tag}')">
      <div class="motor-card-top">
        <span class="motor-tag">${m.tag}</span>
        ${badge}
      </div>
      <div class="motor-desc">${m.description || '—'}</div>
      <div class="motor-meta">
        <span>${m.area || '—'}</span>
        <span>·</span>
        <span>${m.kw || '?'} kW</span>
        <span>·</span>
        <span>${m.voltage || '?'} V</span>
        <span>·</span>
        <span>${m.manufacturer || '—'}</span>
        ${m.accumReading ? `<span>· <b>${Number(m.accumReading).toLocaleString()}</b> hrs</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── MOTOR DETAIL ──────────────────────────────────────
async function openMotorDetail(tag) {
  S.currentMotorTag = tag;
  const m = S.motors.find(x => x.tag === tag);
  if (!m) return;

  const gs = computeGreaseStatus(m);
  const gsl = greaseStatusLabel(m);

  // Grease progress bar
  let barHtml = '';
  if (m.requiresGreasing === 'Yes' && m.greaseInterval) {
    const interval = parseFloat(m.greaseInterval) || 0;
    const diff = m.hrsSinceLastGrease || 0;
    const pct = interval > 0 ? Math.min(100, Math.round((diff / interval) * 100)) : 0;
    const barCls = pct >= 100 ? 'urgent' : pct >= 80 ? 'watch' : '';
    barHtml = `
      <div class="grease-bar-wrap">
        <div class="grease-bar-track"><div class="grease-bar-fill ${barCls}" style="width:${pct}%"></div></div>
        <div class="grease-bar-label"><span>${diff.toLocaleString()} hrs since last grease</span><span>${interval.toLocaleString()} hrs interval</span></div>
      </div>`;
  }

  // History from rounds
  const history = [];
  for (const round of S.rounds) {
    const rd = round.readings?.[tag];
    const greased = round.greased?.[tag];
    if (rd || greased) {
      history.push({ date: round.date, rd, greased });
    }
  }

  const historyHtml = history.length ? history.slice(0,10).map(h => {
    const rdParts = [];
    if (h.rd) {
      if (h.rd.current)  rdParts.push(`I: ${h.rd.current} A`);
      if (h.rd.tempDE)   rdParts.push(`T.DE: ${h.rd.tempDE}°C`);
      if (h.rd.tempNDE)  rdParts.push(`T.NDE: ${h.rd.tempNDE}°C`);
      if (h.rd.hrMeter)  rdParts.push(`Hr: ${Number(h.rd.hrMeter).toLocaleString()}`);
      if (h.rd.noise && h.rd.noise !== 'normal') rdParts.push(`Noise: ${h.rd.noise}`);
    }
    return `<div class="history-entry">
      <div class="history-entry-top">
        <span class="history-type">${h.greased ? '🟢 Greased' : '📋 Round'}</span>
        <span class="history-date">${fmtDate(h.date)}</span>
      </div>
      ${rdParts.length ? `<div class="history-detail">${rdParts.join(' · ')}</div>` : ''}
      ${h.rd?.notes ? `<div class="history-detail" style="font-style:italic">${h.rd.notes}</div>` : ''}
    </div>`;
  }).join('') : `<div style="font-size:0.82rem;color:var(--text-3);padding:8px 0">No round history yet.</div>`;

  const badgeCls = gsl ? gsl.cls : '';
  const badgeText = gsl ? gsl.label : (m.requiresGreasing === 'Yes' ? 'OK' : 'No Grease');

  $('motor-detail-content').innerHTML = `
    <span class="detail-badge ${badgeCls}">${badgeText}</span>
    <div class="detail-tag-big">${m.tag}</div>
    <div class="detail-desc">${m.description || '—'}</div>

    ${gsl ? `<div class="alert-card ${gsl.cls === 'watch' ? 'watch' : ''}" style="margin-bottom:12px">${gsl.reason}</div>` : ''}
    ${barHtml}

    <div class="detail-section">
      <div class="detail-section-title">Nameplate</div>
      <div class="detail-grid">
        <div class="detail-field"><span class="df-label">Area</span><span class="df-val">${m.area||'—'}</span></div>
        <div class="detail-field"><span class="df-label">Manufacturer</span><span class="df-val">${m.manufacturer||'—'}</span></div>
        <div class="detail-field"><span class="df-label">Power</span><span class="df-val mono">${m.kw||'—'} kW · ${m.amp||'—'} A</span></div>
        <div class="detail-field"><span class="df-label">Voltage</span><span class="df-val mono">${m.voltage||'—'} V</span></div>
        <div class="detail-field"><span class="df-label">Speed</span><span class="df-val mono">${m.rpm||'—'} RPM</span></div>
        <div class="detail-field"><span class="df-label">Connection</span><span class="df-val">${m.connection||'—'}</span></div>
        <div class="detail-field"><span class="df-label">Type</span><span class="df-val">${m.motorType||'—'}</span></div>
        <div class="detail-field"><span class="df-label">Serial No.</span><span class="df-val mono">${m.serialNo||'—'}</span></div>
        <div class="detail-field"><span class="df-label">Frame</span><span class="df-val">${m.frameSize||'—'}</span></div>
        <div class="detail-field"><span class="df-label">Drawer</span><span class="df-val mono">${m.drawer||'—'}</span></div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Running Hours</div>
      <div class="detail-grid">
        <div class="detail-field"><span class="df-label">Last Reading</span><span class="df-val mono">${m.hrMeterReading ? Number(m.hrMeterReading).toLocaleString() : '—'}</span></div>
        <div class="detail-field"><span class="df-label">Counter Repeats</span><span class="df-val mono">${m.counterRepeats ?? '—'}</span></div>
        <div class="detail-field"><span class="df-label">Accumulated</span><span class="df-val mono" style="color:var(--accent);font-weight:700">${m.accumReading ? Number(m.accumReading).toLocaleString() : '—'} hrs</span></div>
        <div class="detail-field"><span class="df-label">Bearing Repl. Interval</span><span class="df-val mono">${m.bearingReplInterval ? Number(m.bearingReplInterval).toLocaleString() : '—'} hrs</span></div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Greasing</div>
      <div class="detail-grid">
        <div class="detail-field"><span class="df-label">Requires Greasing</span><span class="df-val">${m.requiresGreasing||'—'}</span></div>
        <div class="detail-field"><span class="df-label">Interval</span><span class="df-val mono">${m.greaseInterval ? Number(m.greaseInterval).toLocaleString() : '—'} hrs</span></div>
        <div class="detail-field"><span class="df-label">Last Grease Date</span><span class="df-val">${fmtDate(m.dateLastGrease)}</span></div>
        <div class="detail-field"><span class="df-label">Hrs Since Grease</span><span class="df-val mono">${m.hrsSinceLastGrease !== null ? Number(m.hrsSinceLastGrease).toLocaleString() : '—'}</span></div>
        <div class="detail-field"><span class="df-label">Grease Type</span><span class="df-val">${m.greaseType||'—'}</span></div>
        <div class="detail-field"><span class="df-label">Qty DE / NDE</span><span class="df-val mono">${m.greaseQtyDE||'—'} / ${m.greaseQtyNDE||'—'} g</span></div>
        <div class="detail-field"><span class="df-label">Grease Replacements</span><span class="df-val mono">${m.dateLastGreaseReplacement ? fmtDate(m.dateLastGreaseReplacement) : '—'}</span></div>
        <div class="detail-field"><span class="df-label">Bearing Type DE/NDE</span><span class="df-val">${m.deBearing||'—'} / ${m.ndeBearing||'—'}</span></div>
        <div class="detail-field full"><span class="df-label">Last Bearing Replacement</span><span class="df-val">${fmtDate(m.dateLastBearingReplacement)} ${m.numBearingReplacements ? `(×${m.numBearingReplacements})` : ''}</span></div>
      </div>
    </div>

    ${m.comments ? `<div class="detail-section">
      <div class="detail-section-title">Comments</div>
      <div style="font-size:0.85rem;line-height:1.6;color:var(--text)">${m.comments}</div>
    </div>` : ''}

    <div class="detail-section">
      <div class="detail-section-title">Round History</div>
      ${historyHtml}
    </div>
  `;

  showView('motor-detail');
}

// ── MOTOR EDIT ────────────────────────────────────────
function openMotorEdit() {
  const m = S.motors.find(x => x.tag === S.currentMotorTag);
  if (!m) return;
  $('edit-title').textContent = m.tag;

  const fields = [
    { key:'description',            label:'Description' },
    { key:'area',                   label:'Area' },
    { key:'manufacturer',           label:'Manufacturer' },
    { key:'kw',                     label:'kW', type:'number' },
    { key:'voltage',                label:'Voltage (V)', type:'number' },
    { key:'amp',                    label:'Current (A)', type:'number' },
    { key:'rpm',                    label:'RPM', type:'number' },
    { key:'greaseInterval',         label:'Grease Interval (hrs)', type:'number' },
    { key:'dateLastGrease',         label:'Last Grease Date', type:'date' },
    { key:'hrMeterReading',         label:'Hr Meter Reading', type:'number' },
    { key:'counterRepeats',         label:'Counter Repeats', type:'number' },
    { key:'deBearing',              label:'DE Bearing' },
    { key:'ndeBearing',             label:'NDE Bearing' },
    { key:'greaseQtyDE',            label:'Grease Qty DE (g)', type:'number' },
    { key:'greaseQtyNDE',           label:'Grease Qty NDE (g)', type:'number' },
    { key:'comments',               label:'Comments', textarea:true },
  ];

  $('motor-edit-form').innerHTML = fields.map(f => `
    <div class="field-group">
      <label>${f.label}</label>
      ${f.textarea
        ? `<textarea id="ef-${f.key}" rows="3">${m[f.key]||''}</textarea>`
        : `<input type="${f.type||'text'}" id="ef-${f.key}" value="${m[f.key]||''}" />`
      }
    </div>
  `).join('') + `
    <div class="form-actions" style="padding:0;margin-top:8px">
      <button class="btn-save" id="btn-save-motor-edit">Save Changes</button>
      <button class="btn-cancel" onclick="showView('motor-detail')">Cancel</button>
    </div>`;

  $('btn-save-motor-edit').onclick = async () => {
    const updated = { ...m };
    fields.forEach(f => {
      const el = $('ef-' + f.key);
      if (el) updated[f.key] = f.type === 'number' ? (el.value !== '' ? parseFloat(el.value) : null) : el.value.trim() || null;
    });
    // Recompute derived fields
    if (updated.hrMeterReading !== null && updated.counterRepeats !== null) {
      const mult = updated.accumReading && updated.accumReading > 65535 * 2 ? 65535 : 10000;
      updated.accumReading = mult * (updated.counterRepeats || 0) + (updated.hrMeterReading || 0);
    }
    if (updated.accumReading !== null && updated.hrsAtLastGrease !== null) {
      updated.hrsSinceLastGrease = (updated.accumReading || 0) - (updated.accumAtLastGrease || 0);
    }
    await DB.saveMotor(updated);
    const idx = S.motors.findIndex(x => x.tag === m.tag);
    if (idx >= 0) S.motors[idx] = updated;
    showToast('Motor updated.');
    openMotorDetail(m.tag);
  };

  showView('motor-edit');
}

// ── MONTHLY ROUND ─────────────────────────────────────
function startNewRound() {
  S.round = {
    id: uid(),
    date: today(),
    tech: '',
    notes: '',
    readings: {},
    greased: {},
  };
  $('round-date').value = today();
  $('round-tech').value = '';
  $('round-notes').value = '';
  $('round-title').textContent = 'Monthly Round';

  buildReadingsList();
  buildGreaseList();
  showView('round');
}

function buildReadingsList() {
  const list = $('readings-list');
  const motors = S.motors;

  list.innerHTML = motors.map(m => {
    const rd = S.round.readings[m.tag] || {};
    const hasSome = rd.hrMeter || rd.current || rd.tempDE;
    return `
    <div class="reading-row" id="rr-${m.tag}">
      <div class="reading-row-header" onclick="toggleReadingRow('${m.tag}')">
        <div class="rr-left">
          <span class="rr-tag">${m.tag}</span>
          <span class="rr-desc">${(m.description||'').slice(0,45)}</span>
        </div>
        <div class="rr-right">
          <span class="rr-status ${hasSome ? 'filled' : 'ok'}">${hasSome ? '✓' : 'tap'}</span>
          <span class="rr-chevron" id="chev-${m.tag}">›</span>
        </div>
      </div>
      <div class="reading-row-body" id="rrb-${m.tag}">
        <div class="hour-meter-field">
          <label>Hour Meter</label>
          <div class="hour-meter-row">
            <div>
              <div style="font-size:0.68rem;color:var(--text-3);margin-bottom:3px">Reading</div>
              <input type="number" placeholder="${m.hrMeterReading||'last: —'}"
                id="rr-hr-${m.tag}" value="${rd.hrMeter||''}"
                oninput="updateAccumPreview('${m.tag}')" step="1"/>
            </div>
            <div class="counter-wrap">
              <label>Rollovers</label>
              <input type="number" placeholder="${m.counterRepeats??0}"
                id="rr-cr-${m.tag}" value="${rd.counterRepeats !== undefined ? rd.counterRepeats : ''}"
                oninput="updateAccumPreview('${m.tag}')" step="1" min="0"/>
            </div>
          </div>
          <div class="accum-preview" id="accum-prev-${m.tag}">
            ${m.accumReading ? `Last accum: ${Number(m.accumReading).toLocaleString()} hrs` : ''}
          </div>
        </div>

        <div class="reading-inputs">
          <div class="reading-input-field">
            <label>Current (A)</label>
            <input type="number" placeholder="—" step="0.1" id="rr-cur-${m.tag}" value="${rd.current||''}"/>
          </div>
          <div class="reading-input-field">
            <label>Temp DE (°C)</label>
            <input type="number" placeholder="—" step="0.5" id="rr-tde-${m.tag}" value="${rd.tempDE||''}"/>
          </div>
          <div class="reading-input-field">
            <label>Temp NDE (°C)</label>
            <input type="number" placeholder="—" step="0.5" id="rr-tnde-${m.tag}" value="${rd.tempNDE||''}"/>
          </div>
          <div class="reading-input-field">
            <label>Winding Temp (°C)</label>
            <input type="number" placeholder="—" step="0.5" id="rr-tw-${m.tag}" value="${rd.tempWinding||''}"/>
          </div>
        </div>

        <div class="reading-input-field" style="margin-bottom:10px">
          <label>Noise / Vibration</label>
          <div class="noise-selector">
            <button class="noise-btn ${(rd.noise||'normal')==='normal'?'active':''}" onclick="setNoise('${m.tag}','normal')">Normal</button>
            <button class="noise-btn ${rd.noise==='unusual'?'active warn':''}" onclick="setNoise('${m.tag}','unusual')">Unusual</button>
            <button class="noise-btn ${rd.noise==='alarming'?'active bad':''}" onclick="setNoise('${m.tag}','alarming')">Alarming</button>
            <button class="noise-btn ${rd.noise==='stopped'?'active':''}" onclick="setNoise('${m.tag}','stopped')">Stopped</button>
          </div>
        </div>

        <div class="reading-input-field">
          <label>Notes</label>
          <input type="text" class="reading-row-notes" placeholder="Any observations…"
            id="rr-note-${m.tag}" value="${rd.notes||''}"/>
        </div>

        <div style="margin-top:8px;text-align:right">
          <button class="btn-secondary" style="font-size:0.78rem;padding:6px 12px"
            onclick="saveReadingRow('${m.tag}')">Save this reading</button>
        </div>
      </div>
    </div>`;
  }).join('');

  updateReadingsProgress();
}

function toggleReadingRow(tag) {
  const body = $('rrb-' + tag);
  const chev = $('chev-' + tag);
  const isOpen = body.classList.toggle('open');
  chev.classList.toggle('open', isOpen);
}

function setNoise(tag, val) {
  if (!S.round.readings[tag]) S.round.readings[tag] = {};
  S.round.readings[tag].noise = val;
  // update buttons
  const btns = document.querySelectorAll(`#rrb-${tag} .noise-btn`);
  btns.forEach(b => {
    const bval = b.textContent.toLowerCase();
    b.className = 'noise-btn';
    if (bval === val) {
      b.classList.add('active');
      if (val === 'unusual') b.classList.add('warn');
      if (val === 'alarming') b.classList.add('bad');
    }
  });
}

function updateAccumPreview(tag) {
  const m = S.motors.find(x => x.tag === tag);
  if (!m) return;
  const hr = parseFloat($('rr-hr-' + tag)?.value) || 0;
  const cr = parseFloat($('rr-cr-' + tag)?.value);
  const repeats = isNaN(cr) ? (parseFloat(m.counterRepeats) || 0) : cr;
  // detect multiplier
  const mult = m.accumReading && m.accumReading > 65535 * 2 ? 65535 : 10000;
  const accum = mult * repeats + hr;
  const prev = $('accum-prev-' + tag);
  if (prev && hr) {
    prev.textContent = `New accum: ${accum.toLocaleString()} hrs (prev: ${m.accumReading ? Number(m.accumReading).toLocaleString() : '?'})`;
  }
}

function saveReadingRow(tag) {
  if (!S.round.readings[tag]) S.round.readings[tag] = {};
  const rd = S.round.readings[tag];
  rd.hrMeter     = $('rr-hr-'+tag)?.value   || null;
  rd.counterRepeats = $('rr-cr-'+tag)?.value ?? null;
  rd.current     = $('rr-cur-'+tag)?.value  || null;
  rd.tempDE      = $('rr-tde-'+tag)?.value  || null;
  rd.tempNDE     = $('rr-tnde-'+tag)?.value || null;
  rd.tempWinding = $('rr-tw-'+tag)?.value   || null;
  rd.notes       = $('rr-note-'+tag)?.value || null;
  if (!rd.noise) rd.noise = 'normal';

  // Mark card header
  const header = document.querySelector(`#rr-${tag} .rr-status`);
  if (header) { header.textContent = '✓'; header.className = 'rr-status filled'; }

  updateReadingsProgress();
  buildGreaseList(); // re-evaluate greasing based on new hours
  showToast(`${tag} saved.`);
}

function updateReadingsProgress() {
  const total = S.motors.length;
  const done  = Object.keys(S.round.readings).filter(t => {
    const rd = S.round.readings[t];
    return rd && (rd.hrMeter || rd.current || rd.tempDE);
  }).length;
  $('readings-progress').textContent = `${done} / ${total}`;
}

function buildGreaseList() {
  const list = $('grease-list');
  const dueMotors = [];

  for (const m of S.motors) {
    if (m.requiresGreasing !== 'Yes') continue;

    // Use new reading hours if entered, otherwise existing
    const rd = S.round.readings[m.tag];
    let currentAccum = m.accumReading;
    if (rd?.hrMeter) {
      const mult = m.accumReading && m.accumReading > 65535 * 2 ? 65535 : 10000;
      const cr = rd.counterRepeats !== null && rd.counterRepeats !== '' ? parseFloat(rd.counterRepeats) : (parseFloat(m.counterRepeats) || 0);
      currentAccum = mult * cr + parseFloat(rd.hrMeter);
    }

    const interval = parseFloat(m.greaseInterval) || 0;
    const accumAtLastGrease = m.accumAtLastGrease || 0;
    const diffHrs = currentAccum - accumAtLastGrease;
    const a1 = interval > 0 && diffHrs >= interval;
    const days = daysSince(m.dateLastGrease);
    const a2 = days !== null && days >= 365;

    if (a1 || a2) {
      dueMotors.push({ m, a1, a2, diffHrs, days });
    }
  }

  $('grease-count-label').textContent = `${dueMotors.length} motors`;

  if (!dueMotors.length) {
    list.innerHTML = `<div style="font-size:0.82rem;color:var(--text-3);padding:8px 16px">No motors due for greasing this round.</div>`;
    return;
  }

  list.innerHTML = dueMotors.map(({ m, a1, a2, diffHrs, days }) => {
    const checked = S.round.greased[m.tag] ? 'checked' : '';
    const doneCls = S.round.greased[m.tag] ? 'done' : '';
    const reason = a1
      ? `${Math.round(diffHrs).toLocaleString()} hrs / ${Number(m.greaseInterval).toLocaleString()} hrs interval`
      : `${days} days since ${fmtDate(m.dateLastGrease)}`;
    const actCls = a1 ? '' : 'a2';
    const actLbl = a1 ? 'A1' : 'A2';
    return `
      <div class="grease-item ${doneCls}" id="gi-${m.tag}">
        <div class="grease-check ${checked ? 'checked' : ''}" id="gc-${m.tag}"
          onclick="toggleGreased('${m.tag}')">${checked ? '✓' : ''}</div>
        <div class="grease-item-info">
          <div class="grease-item-tag">${m.tag}</div>
          <div class="grease-item-reason">${(m.description||'').slice(0,50)} · ${reason}</div>
          <div class="grease-item-qty">DE: ${m.greaseQtyDE||'?'}g · NDE: ${m.greaseQtyNDE||'?'}g · ${m.greaseType ? m.greaseType.split('(')[0].trim() : '—'}</div>
        </div>
        <div class="grease-action-badge ${actCls}">${actLbl}</div>
      </div>`;
  }).join('');
}

function toggleGreased(tag) {
  S.round.greased[tag] = !S.round.greased[tag];
  const check = $('gc-' + tag);
  const item  = $('gi-' + tag);
  if (S.round.greased[tag]) {
    check.classList.add('checked');
    check.textContent = '✓';
    item.classList.add('done');
  } else {
    check.classList.remove('checked');
    check.textContent = '';
    item.classList.remove('done');
  }
}

async function saveRound() {
  const date = $('round-date').value;
  if (!date) { showToast('Please set the round date.'); return; }

  // Collect any unsaved reading row inputs
  for (const m of S.motors) {
    const hr = $('rr-hr-'+m.tag)?.value;
    if (hr || $('rr-cur-'+m.tag)?.value) {
      saveReadingRow(m.tag);
    }
  }

  S.round.date  = date;
  S.round.tech  = $('round-tech').value.trim();
  S.round.notes = $('round-notes').value.trim();

  // Apply greasing back to motors
  const updatedMotors = [];
  for (const [tag, wasGreased] of Object.entries(S.round.greased)) {
    if (!wasGreased) continue;
    const m = S.motors.find(x => x.tag === tag);
    if (!m) continue;
    const rd = S.round.readings[tag];
    let newAccum = m.accumReading;
    if (rd?.hrMeter) {
      const mult = m.accumReading && m.accumReading > 65535 * 2 ? 65535 : 10000;
      const cr = rd.counterRepeats !== null && rd.counterRepeats !== '' ? parseFloat(rd.counterRepeats) : (parseFloat(m.counterRepeats) || 0);
      newAccum = mult * cr + parseFloat(rd.hrMeter);
    }
    const updated = {
      ...m,
      dateLastGrease: date,
      accumAtLastGrease: newAccum,
      hrsSinceLastGrease: 0,
    };
    updatedMotors.push(updated);
  }

  // Also update hour meter readings for all motors that have new readings
  for (const [tag, rd] of Object.entries(S.round.readings)) {
    if (!rd?.hrMeter) continue;
    const m = S.motors.find(x => x.tag === tag);
    if (!m) continue;
    if (updatedMotors.find(x => x.tag === tag)) continue; // already updated by greasing
    const mult = m.accumReading && m.accumReading > 65535 * 2 ? 65535 : 10000;
    const cr = rd.counterRepeats !== null && rd.counterRepeats !== '' ? parseFloat(rd.counterRepeats) : (parseFloat(m.counterRepeats) || 0);
    const newAccum = mult * cr + parseFloat(rd.hrMeter);
    const diff = newAccum - (m.accumAtLastGrease || 0);
    updatedMotors.push({
      ...m,
      hrMeterReading: parseFloat(rd.hrMeter),
      counterRepeats: cr,
      accumReading: newAccum,
      hrsSinceLastGrease: diff > 0 ? diff : m.hrsSinceLastGrease,
    });
  }

  // Save everything
  await DB.saveRound({ ...S.round });
  if (updatedMotors.length) await DB.saveMotors(updatedMotors);

  // Sync state
  S.rounds = [{ ...S.round }, ...S.rounds];
  for (const um of updatedMotors) {
    const idx = S.motors.findIndex(x => x.tag === um.tag);
    if (idx >= 0) S.motors[idx] = um;
  }

  showToast(`Round saved. ${updatedMotors.length} motor${updatedMotors.length!==1?'s':''} updated.`);
  showView('dash');
  renderDash();
}

// ── ROUND DETAIL ──────────────────────────────────────
async function openRoundDetail(id) {
  S.currentRoundId = id;
  const r = await DB.getRound(id);
  if (!r) return;

  const nRead    = Object.keys(r.readings||{}).length;
  const greased  = Object.entries(r.greased||{}).filter(([,v])=>v);
  const nGreased = greased.length;
  const noisy    = Object.entries(r.readings||{}).filter(([,rd])=>rd.noise&&rd.noise!=='normal');

  const readingsRows = Object.entries(r.readings||{}).map(([tag, rd]) => {
    const m = S.motors.find(x => x.tag === tag);
    const noiseCls = rd.noise==='unusual' ? 'unusual' : rd.noise==='alarming' ? 'alarming' : 'normal';
    return `<tr>
      <td><strong>${tag}</strong>${m ? `<br/><span style="font-size:0.72rem;color:var(--text-3)">${(m.description||'').slice(0,30)}</span>` : ''}</td>
      <td>${rd.hrMeter ? Number(rd.hrMeter).toLocaleString() : '—'}</td>
      <td>${rd.current||'—'}</td>
      <td>${rd.tempDE||'—'}${rd.tempNDE ? ' / ' + rd.tempNDE : ''}</td>
      <td><span class="noise-cell ${noiseCls}">${rd.noise||'—'}</span></td>
      <td>${rd.notes||'—'}</td>
    </tr>`;
  }).join('');

  $('round-detail-content').innerHTML = `
    <div class="round-detail-header">
      <div class="round-detail-date">${fmtDate(r.date)}</div>
      <div class="round-detail-meta">
        ${r.tech ? r.tech + ' · ' : ''}${nRead} readings · ${nGreased} greased
        ${noisy.length ? ` · <span style="color:var(--watch)">${noisy.length} noise flag${noisy.length>1?'s':''}</span>` : ''}
      </div>
    </div>

    ${r.notes ? `<div class="detail-section" style="margin-bottom:12px">
      <div class="detail-section-title">Notes</div>
      <div style="font-size:0.85rem;line-height:1.6">${r.notes}</div>
    </div>` : ''}

    ${nGreased ? `<div class="detail-section" style="margin-bottom:12px">
      <div class="detail-section-title">Greased (${nGreased})</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${greased.map(([tag])=>`<span class="motor-badge" style="background:var(--accent-lt);color:var(--accent)">${tag}</span>`).join('')}
      </div>
    </div>` : ''}

    ${nRead ? `<div class="detail-section">
      <div class="detail-section-title">All Readings (${nRead})</div>
      <div style="overflow-x:auto">
        <table class="round-readings-table">
          <thead><tr><th>Motor</th><th>Hr</th><th>A</th><th>°C DE/NDE</th><th>Noise</th><th>Notes</th></tr></thead>
          <tbody>${readingsRows}</tbody>
        </table>
      </div>
    </div>` : ''}
  `;

  showView('round-detail');
}

// ── SHARE ROUND ───────────────────────────────────────
$('btn-share-round').addEventListener('click', async () => {
  if (!S.currentRoundId) return;
  const r = await DB.getRound(S.currentRoundId);
  if (!r) return;

  const lines = [
    `MOPCO Plant 1 — Monthly Round`,
    `Date: ${fmtDate(r.date)}`,
    r.tech ? `Tech: ${r.tech}` : '',
    '',
    `Motors read: ${Object.keys(r.readings||{}).length}`,
    `Greased: ${Object.values(r.greased||{}).filter(Boolean).length}`,
    '',
  ];
  const greased = Object.entries(r.greased||{}).filter(([,v])=>v);
  if (greased.length) {
    lines.push('Greased motors:');
    greased.forEach(([tag]) => lines.push(`  • ${tag}`));
    lines.push('');
  }
  const noisy = Object.entries(r.readings||{}).filter(([,rd])=>rd.noise&&rd.noise!=='normal');
  if (noisy.length) {
    lines.push('Noise flags:');
    noisy.forEach(([tag,rd]) => lines.push(`  • ${tag}: ${rd.noise}`));
    lines.push('');
  }
  if (r.notes) lines.push(`Notes: ${r.notes}`);

  const text = lines.filter(l=>l!==undefined).join('\n').trim();
  if (navigator.share) {
    navigator.share({ title: `Round ${fmtDate(r.date)}`, text }).catch(()=>{});
  } else {
    navigator.clipboard.writeText(text).then(()=>showToast('Copied to clipboard.'));
  }
});

// ── DELETE ROUND ──────────────────────────────────────
$('btn-delete-round').addEventListener('click', () => {
  $('modal-message').textContent = 'Delete this round? This will not undo any motor hour updates.';
  $('modal-overlay').classList.remove('hidden');
  $('modal-confirm').textContent = 'Delete';
  _pendingConfirm = async () => {
    await DB.deleteRound(S.currentRoundId);
    S.rounds = S.rounds.filter(r => r.id !== S.currentRoundId);
    showView('dash'); renderDash();
    showToast('Round deleted.');
  };
});

// ── IMPORT ────────────────────────────────────────────
$('btn-import-db').addEventListener('click', () => showView('import'));

// CSV / xlsx file
$('import-file').addEventListener('change', async function() {
  const file = this.files[0];
  if (!file) return;
  $('import-file-status').textContent = `Reading ${file.name}…`;
  try {
    const text = await file.text();
    const motors = parseCSV(text);
    if (motors.length) {
      showImportPreview(motors);
      $('import-file-status').textContent = `Found ${motors.length} motors.`;
    } else {
      $('import-file-status').textContent = 'Could not parse — try paste method or CSV format.';
    }
  } catch(e) {
    $('import-file-status').textContent = 'Error reading file.';
  }
});

// Paste
$('btn-parse-paste').addEventListener('click', () => {
  const text = $('import-paste').value.trim();
  if (!text) { showToast('Nothing pasted.'); return; }
  const motors = parseCSV(text);
  if (motors.length) showImportPreview(motors);
  else showToast('Could not detect motor data. Make sure headers are included.');
});

function parseCSV(text) {
  const lines = text.trim().split('\n').map(l => l.split(/\t|,/));
  if (lines.length < 2) return [];
  const headers = lines[0].map(h => h.trim().toLowerCase());

  // Try to find key columns
  const tagIdx = headers.findIndex(h => h.includes('tag'));
  if (tagIdx < 0) return [];

  const find = (...keys) => {
    for (const k of keys) {
      const i = headers.findIndex(h => h.includes(k));
      if (i >= 0) return i;
    }
    return -1;
  };

  const cols = {
    tag:           tagIdx,
    area:          find('area', 'process'),
    description:   find('desc'),
    manufacturer:  find('manuf'),
    kw:            find('kw'),
    voltage:       find('volt'),
    amp:           find('amp', 'current'),
    rpm:           find('rpm'),
    greaseInterval: find('grease interval', 'greasing interval'),
    dateLastGrease: find('last greas'),
    hrMeterReading: find('hr. meter', 'hr meter', 'hour meter'),
    counterRepeats: find('counter repeat'),
    accumReading:   find('accum. reading\n', 'accum read'),
    deBearing:      find('de bearing'),
    ndeBearing:     find('nde bearing'),
  };

  return lines.slice(1)
    .map(row => {
      const tag = row[cols.tag]?.trim();
      if (!tag || tag === '') return null;
      const m = { tag };
      Object.entries(cols).forEach(([k, i]) => {
        if (i >= 0 && k !== 'tag') m[k] = row[i]?.trim() || null;
      });
      return m;
    })
    .filter(Boolean);
}

let _importPreviewMotors = [];
function showImportPreview(motors) {
  _importPreviewMotors = motors;
  $('import-count').textContent = motors.length;
  $('import-preview-list').innerHTML = motors.slice(0, 20).map(m =>
    `<div class="import-preview-row">
      <div class="import-preview-tag">${m.tag}</div>
      <div class="import-preview-meta">${[m.area, m.description, m.kw ? m.kw + ' kW' : ''].filter(Boolean).join(' · ')}</div>
    </div>`
  ).join('') + (motors.length > 20 ? `<div style="font-size:0.8rem;color:var(--text-3);padding:6px 0">…and ${motors.length-20} more</div>` : '');
  $('import-preview').classList.remove('hidden');
}

$('btn-confirm-import').addEventListener('click', async () => {
  if (!_importPreviewMotors.length) return;
  await DB.saveMotors(_importPreviewMotors);
  // merge into state
  for (const m of _importPreviewMotors) {
    const idx = S.motors.findIndex(x => x.tag === m.tag);
    if (idx >= 0) S.motors[idx] = { ...S.motors[idx], ...m };
    else S.motors.push(m);
  }
  $('import-preview').classList.add('hidden');
  showToast(`${_importPreviewMotors.length} motors imported.`);
  renderMotorList();
  showView('motors');
});

$('btn-cancel-import').addEventListener('click', () => {
  $('import-preview').classList.add('hidden');
  _importPreviewMotors = [];
});

// ── AI PHOTO READ (nameplate) ─────────────────────────
let _importPhotoData = null;
$('import-photo').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    _importPhotoData = e.target.result;
    const wrap = $('import-photo-preview-wrap');
    wrap.innerHTML = `<img src="${e.target.result}" alt="Preview"/>`;
    $('btn-read-photo').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

$('btn-read-photo').addEventListener('click', async () => {
  if (!_importPhotoData) return;
  const btn = $('btn-read-photo');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Reading…';
  $('import-ai-result').textContent = '';

  try {
    const base64 = _importPhotoData.split(',')[1];
    const mediaType = _importPhotoData.split(';')[0].split(':')[1];

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: `This is a motor nameplate or data sheet. Extract all available fields and return ONLY a JSON object with these keys (use null for missing): tag, description, manufacturer, motorType, serialNo, voltage, kw, amp, rpm, connection, frameSize, deBearing, ndeBearing. Return only the JSON object, no explanation.` }
          ]
        }]
      })
    });
    const data = await resp.json();
    const text = data.content?.map(c => c.text||'').join('') || '';
    let parsed;
    try { parsed = JSON.parse(text.replace(/```json|```/g,'')); } catch(e) { throw new Error('Could not parse AI response.'); }

    $('import-ai-result').innerHTML = `<strong>Detected fields:</strong><br/>` +
      Object.entries(parsed).filter(([,v])=>v).map(([k,v])=>`<span style="color:var(--accent)">${k}:</span> ${v}`).join(' · ');

    // Show preview for single motor
    if (parsed.tag || parsed.serialNo) {
      const m = { tag: parsed.tag || parsed.serialNo || 'NEW-' + Date.now().toString(36), ...parsed };
      showImportPreview([m]);
    }
  } catch(e) {
    $('import-ai-result').textContent = `Error: ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Read with AI';
  }
});

// ── MODAL ─────────────────────────────────────────────
let _pendingConfirm = null;
$('modal-confirm').addEventListener('click', () => {
  $('modal-overlay').classList.add('hidden');
  if (_pendingConfirm) { _pendingConfirm(); _pendingConfirm = null; }
});
$('modal-cancel').addEventListener('click', () => {
  $('modal-overlay').classList.add('hidden');
  _pendingConfirm = null;
});

// ── WIRE BUTTONS ──────────────────────────────────────
$('btn-new-round').addEventListener('click', startNewRound);
$('btn-round-back').addEventListener('click', () => showView('dash'));
$('btn-cancel-round').addEventListener('click', () => showView('dash'));
$('btn-save-round').addEventListener('click', saveRound);
$('btn-motor-back').addEventListener('click', () => showView('motors'));
$('btn-rdetail-back').addEventListener('click', () => showView('dash'));
$('btn-motor-edit').addEventListener('click', openMotorEdit);
$('btn-edit-back').addEventListener('click', () => openMotorDetail(S.currentMotorTag));
$('btn-import-back').addEventListener('click', () => showView('motors'));

// Expand all reading rows
$('btn-expand-all').addEventListener('click', () => {
  const bodies = $$('.reading-row-body');
  const anyOpen = [...bodies].some(b => b.classList.contains('open'));
  bodies.forEach(b => b.classList.toggle('open', !anyOpen));
  $$('.rr-chevron').forEach(c => c.classList.toggle('open', !anyOpen));
  $('btn-expand-all').textContent = anyOpen ? 'Expand All' : 'Collapse All';
});

// Reading search filter
$('reading-search').addEventListener('input', function() {
  const q = this.value.toLowerCase();
  $$('.reading-row').forEach(row => {
    const tag = row.id.replace('rr-','').toLowerCase();
    const m = S.motors.find(x => x.tag.toLowerCase() === tag);
    const match = !q || tag.includes(q) || (m?.area||'').toLowerCase().includes(q) || (m?.description||'').toLowerCase().includes(q);
    row.style.display = match ? '' : 'none';
  });
});

// Motor search & filter
$('motor-search').addEventListener('input', e => { S.motorSearch = e.target.value; renderMotorList(); });
$$('.filter-chip').forEach(c => {
  c.addEventListener('click', () => {
    $$('.filter-chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active');
    S.motorFilter = c.dataset.mfilter;
    renderMotorList();
  });
});

// Bottom nav
$$('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    if (view === 'motors') renderMotorList();
    if (view === 'dash')   renderDash();
    showView(view);
  });
});

// ── INIT ──────────────────────────────────────────────
async function init() {
  // Load seed data
  const resp = await fetch('./js/motors_data.json');
  SEED_MOTORS = await resp.json();

  // Check if DB has motors; if not, seed from Excel data
  const count = await DB.getMotorCount();
  if (count === 0) {
    await DB.saveMotors(SEED_MOTORS);
    S.motors = [...SEED_MOTORS];
  } else {
    S.motors = await DB.getAllMotors();
  }

  S.rounds = await DB.getAllRounds();
  renderDash();
}

init();
