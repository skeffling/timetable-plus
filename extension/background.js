// Watches the ClassCharts parent app's own API calls and remembers the
// Authorization header (session id) and pupil id, so the extension can replay
// them: the timetable page fetches a fortnight of lessons, and the Timetable Plus panel
// on the ClassCharts page asks here which rota week is which.

// Chrome runs this as a service worker (load common.js here); Firefox lists common.js first
// in background.scripts, where importScripts doesn't exist.
if (typeof importScripts === 'function') importScripts('common.js');

const api = globalThis.browser ?? globalThis.chrome;
const ROTA_TTL = 7 * 864e5; // a week's rota number is fixed long in advance; recheck weekly

// Chrome only exposes some headers with "extraHeaders"; Firefox rejects the value.
const extraInfo = ['requestHeaders'];
if (api.webRequest.OnBeforeSendHeadersOptions?.EXTRA_HEADERS) extraInfo.push('extraHeaders');

// Every ClassCharts API call (including our own) passes through here, so only write on change.
let lastSeen = '';
api.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const header = details.requestHeaders?.find((h) => h.name.toLowerCase() === 'authorization');
    if (!header?.value) return;
    const update = { auth: header.value };
    const m = details.url.match(/\/apiv2parent\/[a-z_]+\/(\d+)/i);
    if (m) update.pupilId = m[1];
    const seen = `${update.auth}|${update.pupilId ?? ''}`;
    if (seen === lastSeen) return;
    lastSeen = seen;
    ccStore().set(update);
  },
  { urls: [`${CC_BASE}/*`] },
  extraInfo
);

function openTimetable(pupilId, pocket) {
  const params = new URLSearchParams();
  if (pupilId) params.set('pupil', pupilId);
  if (pocket) params.set('pocket', '1');
  const query = params.toString();
  api.tabs.create({ url: api.runtime.getURL('timetable.html') + (query ? `?${query}` : '') });
}

api.action.onClicked.addListener(() => openTimetable());

// Messages from the Timetable Plus panel content.js adds to the ClassCharts timetable page.
// (sendResponse + `return true` rather than returning a promise: works in both Chrome and Firefox.)
api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'openTimetable') {
    openTimetable(msg.pupilId, msg.pocket);
    return false;
  }
  if (msg?.type === 'rotaWeeks') {
    rotaWeeks(msg.pupilId, msg.count)
      .then((weeks) => sendResponse({ weeks }))
      .catch((e) => sendResponse({ error: e.message, expired: !!e.expired }));
    return true;
  }
  return false;
});

// --- Which rota week is it? ---------------------------------------------------------------
// One day with lessons tells us that week's number (from its "W02:D01:01" period names).
// Each week's answer is cached for ROTA_TTL.

async function rotaWeeks(pupilId, count = 1) {
  if (!pupilId) throw new Error('No pupil');
  const cacheKey = `rota:${pupilId}`;
  const cache = (await ccStore().get(cacheKey))[cacheKey] ?? {};

  const first = mondayOf(new Date());
  const mondays = Array.from({ length: count }, (_, i) => isoDate(addDays(first, i * 7)));
  const missing = mondays.filter((m) => !(Date.now() - (cache[m]?.at ?? 0) < ROTA_TTL));
  if (missing.length) {
    await mapLimit(missing, 3, async (m) => {
      cache[m] = { ...(await rotaForWeek(pupilId, parseDate(m))), at: Date.now() };
    });
    await ccStore().set({ [cacheKey]: cache });
  }
  return mondays.map((monday) => ({ monday, week: cache[monday].week, holiday: cache[monday].holiday }));
}

async function rotaForWeek(pupilId, monday) {
  for (let d = 0; d < 5; d++) {
    const lessons = lessonsOf(await ccGet(`/timetable/${pupilId}?date=${isoDate(addDays(monday, d))}`));
    if (!lessons.length) continue; // bank holiday / INSET: try the next day
    // null: lessons, but this school doesn't label rota weeks
    return { week: rotaFromPeriodNames(lessons.map((l) => l.period_name)) ?? null };
  }
  return { holiday: true };
}
