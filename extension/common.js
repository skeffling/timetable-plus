// Helpers shared by the background script, the timetable page and the ClassCharts content script.
// Plain globals rather than a module, so the same file loads everywhere: importScripts() in Chrome's
// service worker, the manifest's background.scripts list in Firefox, a <script> tag in
// timetable.html and the content_scripts list. Names here must not clash with those files' own.

const CC_BASE = 'https://www.classcharts.com/apiv2parent';

// Session header and pupil id captured by background.js; cleared when the browser closes.
function ccStore() {
  const ext = globalThis.browser ?? globalThis.chrome;
  return ext.storage.session ?? ext.storage.local;
}

// GET a ClassCharts parent API path with the session the parent's own tab is using.
// Errors carry `expired` when logging in again is the likely fix.
async function ccGet(path) {
  const { auth } = await ccStore().get('auth');
  if (!auth) throw Object.assign(new Error('No ClassCharts login seen yet'), { expired: true });
  const res = await fetch(CC_BASE + path, { headers: { Authorization: auth } });
  const json = await res.json().catch(() => null); // non-JSON error page
  if (!res.ok || !json || json.success === 0) {
    const msg = json?.error || json?.message || `HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { expired: res.status === 401 || /session|expired|log ?in|auth/i.test(msg) });
  }
  return json;
}

// The lesson list in a /timetable response (an array, or occasionally keyed by date).
function lessonsOf(json) {
  const data = json?.data;
  return (Array.isArray(data) ? data : Object.values(data || {}).flat()).filter((l) => l && typeof l === 'object');
}

// ClassCharts period names look like "W02:D01:01" (rota week 2, day 1, lesson 1).
// Returns the most common week number among them, or undefined if none are labelled.
function rotaFromPeriodNames(names) {
  const counts = new Map();
  for (const name of names) {
    const m = /\bW0*(\d+)\b/i.exec(name || '');
    if (m) bump(counts, +m[1]);
  }
  return mostCommon(counts);
}

// Run fn over items with at most `limit` in flight; results keep the input order.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function bump(map, k) { map.set(k, (map.get(k) || 0) + 1); }
function mostCommon(map) { return [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]; }

// Weekends roll forward to the coming Monday.
function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay();
  x.setDate(x.getDate() + (dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow));
  return x;
}
function isWeekend(d = new Date()) { return d.getDay() % 6 === 0; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
function fmtDate(d, year) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
}
