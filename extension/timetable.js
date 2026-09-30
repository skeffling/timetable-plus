// Uses helpers from common.js (loaded first by timetable.html).
const api = globalThis.browser ?? globalThis.chrome;
const ORIGINS = ['https://www.classcharts.com/*'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const AUTO_WEEKS = 4;
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo') || !api?.storage;

const $ = (sel) => document.querySelector(sel);

let loaded = null;  // weeks being shown: [[{ date, lessons } × 5], …]
let generation = 0; // bumped per load, so only the newest load gets rendered
let pending = null;
const dayCache = new Map(); // `${pupil}|${iso}` -> lessons, so changing options only fetches new days

// Remembered between visits (storage.local; plain localStorage in demo mode).
const OPTION_IDS = ['showTeacher', 'showRoom', 'showCode', 'showDates', 'onePage', 'pocket', 'phoneLock', 'phoneDark'];
let shortNames = {}; // full subject name -> user's short name for pocket cards
let names = {};      // pupilId -> { title, weeks: { 'rota2' | 'idx0': heading } }
let saveTimer = null;

const prefs = {
  async get(key, fallback) {
    try {
      if (api?.storage?.local) return (await api.storage.local.get(key))[key] ?? fallback;
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch { return fallback; }
  },
  async set(key, value) {
    try {
      if (api?.storage?.local) await api.storage.local.set({ [key]: value });
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { console.warn('Could not save', key, e); }
  },
};

function saveSettings() {
  const settings = { weeks: $('#weeks').value };
  for (const id of OPTION_IDS) settings[id] = $('#' + id).checked;
  prefs.set('settings', settings);
}

// Typing in a heading saves after a short pause rather than on every key.
function saveNamesSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => prefs.set('names', names), 400);
}

function pupilNames() {
  const id = $('#pupil').value || 'default';
  names[id] ??= { weeks: {} };
  names[id].weeks ??= {};
  return names[id];
}

async function loadPrefs() {
  const settings = await prefs.get('settings', {});
  for (const id of OPTION_IDS) if (typeof settings[id] === 'boolean') $('#' + id).checked = settings[id];
  if (settings.weeks && [...$('#weeks').options].some((o) => o.value === settings.weeks)) $('#weeks').value = settings.weeks;
  shortNames = await prefs.get('shortNames', {});
  names = await prefs.get('names', {});
}

function bindEditing() {
  $('#title').addEventListener('input', () => {
    pupilNames().title = $('#title').textContent.trim();
    saveNamesSoon();
  });
  const out = $('#weeks-out');
  out.addEventListener('input', (e) => {
    const h = e.target.closest('h2[data-key]');
    if (!h) return;
    pupilNames().weeks[h.dataset.key] = h.textContent.trim();
    saveNamesSoon();
  });
  // Pocket-card subjects are editable; a rename applies to every lesson of that subject.
  out.addEventListener('focusout', (e) => {
    const el = e.target.closest('.subject[data-subject]');
    if (!el) return;
    const subject = el.dataset.subject;
    const text = el.textContent.trim();
    if (!text || text === autoShortSubject(subject)) delete shortNames[subject];
    else shortNames[subject] = text;
    prefs.set('shortNames', shortNames);
    render();
  });
  out.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.isContentEditable) { e.preventDefault(); e.target.blur(); }
  });
  $('#reset').addEventListener('click', () => {
    if (!confirm('Reset the title, week names and short subject names back to the defaults?')) return;
    shortNames = {};
    delete names[$('#pupil').value || 'default'];
    prefs.set('shortNames', shortNames);
    prefs.set('names', names);
    render();
  });
}


async function init() {
  $('#start').value = isoDate(mondayOf(new Date()));
  await loadPrefs();
  if (params.has('pocket')) $('#pocket').checked = true;
  bindEditing();
  $('#generate').addEventListener('click', () => { dayCache.clear(); generate(); });
  // Options that need fresh data reload by themselves (debounced, so typing a date doesn't spam ClassCharts).
  for (const id of ['start', 'weeks']) $('#' + id).addEventListener('change', scheduleGenerate);
  $('#weeks').addEventListener('change', saveSettings);
  $('#print').addEventListener('click', () => window.print());
  $('#grant').addEventListener('click', grantAccess);
  for (const id of OPTION_IDS) {
    $('#' + id).addEventListener('change', () => { saveSettings(); render(); });
  }

  if (DEMO) {
    $('#pupil').replaceChildren(new Option('Alex Example (demo)', 'demo'));
    return generate();
  }

  if (api.permissions && !(await api.permissions.contains({ origins: ORIGINS }))) {
    $('#grant').hidden = false;
    return setStatus('This extension needs permission to read classcharts.com. Click the button below, then reload your ClassCharts tab.', true);
  }

  const { auth } = await ccStore().get('auth');
  if (auth) return start();
  setStatus('No ClassCharts login seen yet. Open ClassCharts (www.classcharts.com/mobile/parent) and log in. This page will load by itself.', true);
  waitForLogin(start);
}

async function start() {
  await loadPupils(params.get('pupil') || (await ccStore().get('pupilId')).pupilId);
  generate();
}

// Run `then` once, the next time background.js sees a (new) ClassCharts login, e.g. after the
// parent reloads the ClassCharts tab, so there's no need to come back and click Reload.
let loginWaiter = null;
function waitForLogin(then) {
  if (loginWaiter) api.storage.onChanged.removeListener(loginWaiter);
  loginWaiter = (changes) => {
    if (!changes.auth?.newValue) return;
    api.storage.onChanged.removeListener(loginWaiter);
    loginWaiter = null;
    then();
  };
  api.storage.onChanged.addListener(loginWaiter);
}

async function grantAccess() {
  if (await api.permissions.request({ origins: ORIGINS })) {
    $('#grant').hidden = true;
    setStatus('Access granted. Now reload your ClassCharts tab, view the timetable, then click Reload.');
  }
}

async function loadPupils(preferredId) {
  const select = $('#pupil');
  let pupils = [];
  try {
    const json = await ccGet('/pupils');
    pupils = (Array.isArray(json.data) ? json.data : []).map((p) => ({
      id: String(p.id),
      name: decode(p.name || [p.first_name, p.last_name].filter(Boolean).join(' ')) || `Pupil ${p.id}`,
    }));
  } catch (e) {
    console.warn('Could not load pupil list', e);
  }
  if (!pupils.length && preferredId) pupils = [{ id: preferredId, name: `Pupil ${preferredId}` }];
  select.replaceChildren(...pupils.map((p) => new Option(p.name, p.id)));
  if (preferredId && pupils.some((p) => p.id === preferredId)) select.value = preferredId;
  select.addEventListener('change', generate);
}

function scheduleGenerate() {
  clearTimeout(pending);
  // A half-typed date isn't worth loading; wait for a complete one.
  if (!parseDate($('#start').value)) return;
  pending = setTimeout(generate, 400);
}

async function generate() {
  clearTimeout(pending);
  const run = ++generation;
  const pupilId = $('#pupil').value;
  const auto = $('#weeks').value === 'auto';
  const weeks = auto ? AUTO_WEEKS : clamp(parseInt($('#weeks').value, 10) || 2, 1, 4);
  const start = mondayOf(parseDate($('#start').value) || new Date());
  $('#start').value = isoDate(start);

  if (!DEMO && !pupilId) return setStatus('No pupil found. Open the timetable in ClassCharts first, then click Reload.', true);

  const dates = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 5; d++) dates.push(addDays(start, w * 7 + d));
  }

  setStatus(`Loading ${dates.length} days…`);
  try {
    const days = await mapLimit(dates, 5, async (date) => {
      if (run !== generation) return null; // superseded: stop fetching
      const iso = isoDate(date);
      const key = `${pupilId}|${iso}`;
      if (!dayCache.has(key)) {
        dayCache.set(key, DEMO ? demoLessons(date) : normalise(await ccGet(`/timetable/${pupilId}?date=${iso}`), iso));
      }
      return { date, lessons: dayCache.get(key) };
    });
    if (run !== generation) return; // options changed while loading; a newer load is on its way
    let weekList = [];
    for (let w = 0; w < weeks; w++) weekList.push(days.slice(w * 5, w * 5 + 5));

    const status = [];
    const thisWeek = rotaWeek(weekList[0]);
    if (thisWeek != null && isoDate(start) === isoDate(mondayOf(new Date()))) {
      status.push(`${isWeekend() ? 'Next' : 'This'} week is Week ${thisWeek}.`);
    }
    if (auto) {
      const found = detectCycle(weekList);
      if (found) {
        weekList = sortByRota(foldCycle(weekList, found.cycle));
        const rolling = found.cycle > 1 ? 'rolling ' : '';
        status.push(`Checked ${weeks} weeks: ${found.note}, so this is a ${found.cycle}-week ${rolling}timetable.`);
      } else {
        status.push(`Checked ${weeks} weeks but couldn't find a repeating pattern, so showing all ${weeks}.`);
      }
    }
    const empty = weekList.flat().filter((d) => !d.lessons.length).length;
    if (empty) status.push(`${empty} day(s) had no lessons (holiday/INSET?).${auto ? '' : ' You may want a different starting Monday.'}`);
    setStatus(status.join(' ') || 'Loaded.');
    loaded = weekList;
    render();
  } catch (e) {
    if (run !== generation) return;
    console.error(e);
    if (!e.expired) return setStatus(`Couldn't load the timetable: ${e.message}`, true);
    setStatus('ClassCharts has logged this session out. Reload the ClassCharts tab (log in again if asked) and this page will update by itself.', true);
    if (!DEMO) waitForLogin(generate);
  }
}

// Similarity of two weeks: shared (start time, subject) pairs over all pairs, counting only days
// that have lessons in both weeks (so holidays don't count against a match). Teachers/rooms are
// ignored because cover changes them.
function weekSimilarity(a, b) {
  let shared = 0, total = 0;
  for (let d = 0; d < 5; d++) {
    if (!a[d]?.lessons.length || !b[d]?.lessons.length) continue;
    const sa = new Set(a[d].lessons.map((l) => `${l.start}|${l.subject}`));
    const sb = new Set(b[d].lessons.map((l) => `${l.start}|${l.subject}`));
    for (const x of sa) if (sb.has(x)) shared++;
    total += new Set([...sa, ...sb]).size;
  }
  return total ? shared / total : null;
}

// Work out how many weeks the timetable repeats over. Returns { cycle, note } or null.
function detectCycle(weeks, threshold = 0.85) {
  // 1. ClassCharts' rota codes ("W02:D05:01") say outright which rota week each week is.
  const codes = weeks.map(rotaWeek);
  const known = codes.filter((n) => n != null);
  if (known.length >= 2) {
    const cycle = new Set(known).size;
    const consistent = codes.every((n, i) => n == null || codes[i + cycle] == null || codes[i + cycle] === n);
    if (consistent && cycle < weeks.length) {
      return { cycle, note: `ClassCharts labels these weeks ${codes.map((n) => n ?? '?').join(', ')}` };
    }
  }

  // 2. Otherwise compare lessons. Rota weeks can differ by a single lesson (e.g. sixth form with
  // lots of frees), so rather than accept "close enough" for 1 week, prefer whichever cycle fits better.
  const fit = (cycle) => {
    const scores = [];
    for (let i = 0; i + cycle < weeks.length; i++) {
      const s = weekSimilarity(weeks[i], weeks[i + cycle]);
      if (s !== null) scores.push(s);
    }
    return scores.length ? Math.min(...scores) : null;
  };
  const one = fit(1), two = fit(2);
  if (two !== null && two >= threshold && (one === null || two > one + 0.001)) {
    return { cycle: 2, note: 'weeks 1 & 3 and 2 & 4 match' };
  }
  if (one !== null && one >= threshold) return { cycle: 1, note: 'every week matches' };
  return null;
}

// Collapse to one copy of each week in the cycle, filling holiday days from a matching week.
function foldCycle(weeks, cycle) {
  return Array.from({ length: cycle }, (_, p) =>
    Array.from({ length: 5 }, (_, d) => {
      const same = weeks.filter((_, i) => i % cycle === p);
      return same.find((w) => w[d].lessons.length)?.[d] ?? same[0][d];
    }));
}

// If ClassCharts' rota codes say which is Week 1/Week 2, print them in that order.
function sortByRota(weeks) {
  const nums = weeks.map(rotaWeek);
  if (nums.some((n) => n == null)) return weeks;
  return weeks.map((w, i) => [w, nums[i]]).sort((a, b) => a[1] - b[1]).map(([w]) => w);
}

function rotaWeek(days) {
  return rotaFromPeriodNames(days.flatMap((d) => d.lessons.map((l) => l.periodName)));
}

// Map a ClassCharts timetable response to plain lesson objects.
function normalise(json, iso) {
  return lessonsOf(json)
    .filter((l) => !/^\d{4}-\d{2}-\d{2}/.test(l.date || '') || String(l.date).slice(0, 10) === iso)
    .map((l) => ({
      start: hhmm(l.start_time),
      end: hhmm(l.end_time),
      periodName: decode(l.period_name),
      subject: decode(l.subject_name || l.lesson_name),
      code: decode(l.lesson_name),
      teacher: decode(l.teacher_name),
      room: decode(l.room_name),
    }));
}

// ClassCharts sends names HTML-encoded ("Pure &amp; Applied"); decode once so they display as text.
// DOMParser gives inert text, so nothing in the string runs.
function decode(v) {
  const s = String(v ?? '');
  return s.includes('&') ? new DOMParser().parseFromString(s, 'text/html').documentElement.textContent : s;
}

function render() {
  if (!loaded) return;
  const opts = {
    teacher: $('#showTeacher').checked,
    room: $('#showRoom').checked,
    code: $('#showCode').checked,
    dates: $('#showDates').checked,
  };
  const pocket = $('#pocket').checked;
  document.body.classList.toggle('one-page', $('#onePage').checked && !pocket);
  document.body.classList.toggle('pocket', pocket);

  const firstName = pupilFirstName();
  const title = $('#title');
  if (document.activeElement !== title) title.textContent = pageTitle();

  const allLessons = loaded.flat().flatMap((d) => d.lessons);
  assignColours(allLessons);
  const slots = buildSlots(allLessons);
  const out = $('#weeks-out');

  if (pocket) {
    // Each week is an ID-card-sized (85.6×54mm) card, two per row with a fold line between,
    // so a fortnight cuts out as one strip and folds into a double-sided card.
    out.replaceChildren(h('div', { class: 'pocket-sheet' }, loaded.map((days, w) => weekSection('week card', days, w,
      h('span', { class: 'wc' }, firstName),
      DAY_NAMES.map((d) => h('th', {}, d)),
      slots.map((slot) => h('tr', {},
        h('th', {}, slot.time.split('–')[0]),
        lessonCells(slot, days, slots.length, '—', (l) => pocketLesson(l, opts))))))));
  } else {
    out.replaceChildren(...loaded.map((days, w) => weekSection('week', days, w,
      opts.dates && h('span', { class: 'wc' }, `w/c ${fmtDate(days[0].date, true)}`),
      days.map((d, i) => h('th', {}, DAY_NAMES[i], opts.dates && h('span', { class: 'date' }, fmtDate(d.date)))),
      slots.map((slot) => h('tr', {},
        h('th', {}, h('span', { class: 'pname' }, `Period ${slot.index + 1}`), h('span', { class: 'ptime' }, slot.time)),
        lessonCells(slot, days, slots.length, 'No lessons', (l) => fullLesson(l, slot, opts)))))));
  }
}

// Builds DOM nodes directly rather than from HTML strings, so text from ClassCharts is only ever
// inserted as text. Children may be nodes, strings or nested arrays; null/false/'' are skipped.
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v);
  }
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false && c !== ''));
  return el;
}

function weekSection(className, days, w, aside, headCells, rows) {
  return h('section', { class: className },
    h('div', { class: 'week-head' }, weekHeading(days, w), aside),
    h('table', {},
      h('thead', {}, h('tr', {}, h('th'), headCells)),
      h('tbody', {}, rows)));
}

function weekHeading(days, w) {
  const { key, text } = weekTitle(days, w);
  return h('h2', { contenteditable: 'true', spellcheck: 'false', 'data-key': key }, text);
}

// Saved per pupil, keyed by rota week number when ClassCharts gives one (so "Week A" sticks to
// rota week 1 whatever date you start from), else by position.
function weekTitle(days, w) {
  const rota = rotaWeek(days);
  const key = rota != null ? `rota${rota}` : `idx${w}`;
  return { key, text: pupilNames().weeks[key] || `Week ${rota ?? w + 1}` };
}

function pupilFirstName() {
  return ($('#pupil').selectedOptions[0]?.textContent || '').split(' ')[0];
}

function pageTitle() {
  const firstName = pupilFirstName();
  return pupilNames().title || (firstName ? `${firstName}'s Timetable` : 'Timetable');
}

// One table row's day cells. A day with no lessons at all (holiday) is a single cell spanning every row.
function lessonCells(slot, days, rowCount, dayOffText, lessonNodes) {
  return days.map((day) => {
    if (!day.lessons.length) return slot.index === 0 && h('td', { class: 'dayoff', rowspan: rowCount }, dayOffText);
    const lessons = day.lessons.filter((l) => slotKey(l) === slot.key);
    if (!lessons.length) return h('td', { class: 'nolesson' });
    return h('td', { class: 'has-lesson', style: `background:${colourFor(lessons[0].subject)}` }, lessons.map(lessonNodes));
  });
}

function fullLesson(l, slot, opts) {
  const meta = [opts.teacher && l.teacher, opts.room && l.room].filter(Boolean).join(' · ');
  const time = `${l.start}–${l.end}`;
  return h('div', { class: 'lesson' },
    h('div', { class: 'subject' }, l.subject),
    opts.code && l.code && l.code !== l.subject && h('div', { class: 'code' }, l.code),
    meta && h('div', { class: 'meta' }, meta),
    l.start && time !== slot.time && h('div', { class: 'time' }, time));
}

// Short subject (click to rename), room on the left, teacher initials on the right.
function pocketLesson(l, opts) {
  const room = opts.room && l.room && h('span', {}, l.room);
  const teacher = opts.teacher && l.teacher && h('span', { class: 'teacher' }, shortTeacher(l.teacher));
  return [
    h('div', { class: 'subject', contenteditable: 'true', spellcheck: 'false', title: 'Click to rename', 'data-subject': l.subject }, shortSubject(l)),
    (room || teacher) && h('div', { class: 'meta' }, room, teacher),
  ];
}

const SHORT_NAMES = [
  [/^mathematics/i, 'Maths'],
  [/^english lang/i, 'English'],
  [/^english lit/i, 'Eng Lit'],
  [/^religion|^religious/i, 'RE'],
  [/^food/i, 'Food'],
  [/^physical education.*(gcse|gce)/i, 'PE GCSE'],
  [/^physical education/i, 'PE'],
  [/^art/i, 'Art'],
  [/^personal dev/i, 'PD'],
  [/^pshe/i, 'PSHE'],
  [/^geography/i, 'Geog'],
  [/^history/i, 'History'],
  [/^computer|^computing/i, 'Comp'],
  [/^design (and|&) tech/i, 'DT'],
  [/^drama/i, 'Drama'],
  [/^music/i, 'Music'],
  [/^science/i, 'Science'],
  [/^biology/i, 'Biology'],
  [/^chemistry/i, 'Chem'],
  [/^physics/i, 'Physics'],
  [/^french/i, 'French'],
  [/^spanish/i, 'Spanish'],
  [/^german/i, 'German'],
];

const TITLES = /^(mr|mrs|ms|miss|mx|dr|prof|sir|mme|mlle|madame|monsieur|herr|frau|sr|sra|srta)\.?$/i;

// "Mrs S Jones" -> "Mrs SJ", "Dr Jane van Dyke" -> "Dr JvD"; no title -> just initials.
function shortTeacher(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const title = TITLES.test(words[0] ?? '') ? words.shift().replace(/\.$/, '') : '';
  const initials = words.map((w) => w[0]).join('');
  return [title, initials].filter(Boolean).join(' ') || name;
}

function shortSubject(l) {
  return shortNames[l.subject] || autoShortSubject(l.subject);
}

function autoShortSubject(name) {
  for (const [re, short] of SHORT_NAMES) if (re.test(name)) return short;
  if (name.length <= 9) return name;
  // Fall back to initials of the main words: "Business and Enterprise" -> "BE".
  return name.split(/[\s,/]+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join('') || name.slice(0, 9);
}

// Rows are lesson start times; ClassCharts' period fields are rota codes, not row numbers.
function slotKey(l) {
  return l.start ? `t:${l.start}` : `p:${l.periodName}`;
}

function buildSlots(lessons) {
  const map = new Map();
  for (const l of lessons) {
    const key = slotKey(l);
    if (!map.has(key)) map.set(key, { key, start: l.start, times: new Map() });
    bump(map.get(key).times, l.start ? `${l.start}–${l.end}` : '');
  }
  return [...map.values()]
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''))
    .map((s, index) => ({
      key: s.key,
      index,
      time: mostCommon(s.times) || '',
    }));
}

const PALETTE = [
  '#cfe3fb', '#fde2c4', '#d4f0d0', '#f6d0e4', '#e3d7f7', '#fff1b8',
  '#c9efeb', '#f9d3cf', '#dde7c7', '#d6dcf5', '#f3dfc9', '#e0e0e0',
];
let subjectColours = new Map();

// Each distinct subject gets its own palette colour (alphabetical, so it's stable between loads).
function assignColours(lessons) {
  const subjects = [...new Set(lessons.map((l) => l.subject))].sort();
  subjectColours = new Map(subjects.map((s, i) => [s, PALETTE[i % PALETTE.length]]));
}

function colourFor(subject) {
  return subjectColours.get(subject) || '#fff';
}

// Accepts "2026-10-09T08:55:00+01:00", "08:55:00" or "08:55".
function hhmm(v) {
  const m = String(v ?? '').match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '';
}

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
function setStatus(msg, isError = false) {
  const el = $('#status');
  el.textContent = msg;
  el.classList.toggle('error', isError);
}

// Sample data so the layout can be previewed without a ClassCharts login (open timetable.html?demo).
function demoLessons(date) {
  const times = [['08:55', '09:59'], ['10:00', '10:59'], ['11:25', '12:24'], ['12:25', '13:57'], ['14:00', '14:59']];
  const subjects = [
    ['Religion and Philosophy', '9x/Rp3', 'Mrs A Example', 'G2'],
    ['Mathematics', '9x/Ma3', 'Mr B Sample', 'M2'],
    ['English Language', '9x/En1', 'Ms C Placeholder', 'F4'],
    ['Geography', '9x/Gg2', 'Mr D Demo', 'H10'],
    ['Science', '9x/Sc1', 'Dr E Specimen', 'N5'],
    ['History', '9x/Hi2', 'Miss F Fictional', 'H4'],
    ['French', '9x/Fr1', 'Mme G Exemple', 'L3'],
    ['PE', '9x/Pe2', 'Mr H Trial', 'Sports Hall'],
    ['Art', '9x/Ar1', 'Ms J Mock', 'A1'],
    ['Computing', '9x/Cs1', 'Mr K Test', 'IT2'],
  ];
  // Two-week rota: week parity counted from Mondays (the epoch was a Thursday, hence +3).
  const week = Math.floor((Math.round(date.getTime() / 864e5) + 3) / 7) % 2 + 1;
  const seed = week * 5 + date.getDay();
  return times.map(([start, end], i) => {
    const [subject, code, teacher, room] = subjects[(seed * 3 + i * 7) % subjects.length];
    const day = date.getDay();
    const periodName = `W0${week}:D0${day}:0${i + 1}`;
    return { start, end, periodName, subject, code, teacher, room };
  });
}

// Last, so every top-level const above is initialised before init() runs.
init();
