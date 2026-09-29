// Adds a floating "Timetable Plus" button while the ClassCharts parent app is showing a timetable
// (URL hash like "#8276920,timetable"). Clicking it opens a panel with this week's rota week,
// the coming weeks and links to the printable timetable / pocket card.
// Uses helpers from common.js (listed before this file in the manifest).
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const UPCOMING = 8;
  let host = null;
  let root = null;
  let loadedFor = null; // pupil the panel list was loaded for
  const $ = (sel) => root.querySelector(sel);

  function pupilFromHash() {
    const m = /^#(\d+),timetable\b/i.exec(location.hash);
    return m ? m[1] : null;
  }

  function ask(msg) {
    // Promise form works in both browsers (Firefox's browser.* has no callback form).
    try {
      return api.runtime.sendMessage(msg).catch((e) => ({ error: e.message }));
    } catch (e) {
      // Extension was reloaded/updated while this page stayed open.
      return Promise.resolve({ error: e.message, stale: true });
    }
  }

  function build() {
    host = document.createElement('div');
    // Shadow DOM keeps the page's CSS and ours apart.
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
        .pill {
          position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
          display: flex; align-items: center; gap: 8px;
          padding: 10px 16px; border: 0; border-radius: 24px;
          background: #2196f3; color: #fff; cursor: pointer;
          font-size: 14px; font-weight: 600; line-height: 1;
          box-shadow: 0 3px 10px rgba(0, 0, 0, .25);
        }
        .pill:hover { background: #1976d2; }
        .pill svg { width: 18px; height: 18px; fill: currentColor; }
        .panel {
          position: fixed; right: 20px; bottom: 72px; z-index: 2147483647;
          width: 260px; max-height: calc(100vh - 100px); overflow: auto;
          background: #fff; color: #1d2330; border-radius: 12px;
          box-shadow: 0 8px 28px rgba(0, 0, 0, .28); padding: 14px 16px 16px;
          font-size: 14px; line-height: 1.35;
        }
        .panel[hidden] { display: none; }
        .label { font-size: 12px; color: #5d6677; text-transform: uppercase; letter-spacing: .04em; }
        .now { font-size: 26px; font-weight: 700; margin: 2px 0 10px; }
        ul { list-style: none; margin: 4px 0 12px; padding: 0; }
        li { display: flex; justify-content: space-between; padding: 5px 0; border-top: 1px solid #eef1f5; }
        li .wk { font-weight: 600; }
        li.holiday .wk { color: #8a93a3; font-weight: 400; font-style: italic; }
        .msg { color: #5d6677; font-size: 13px; margin: 6px 0 12px; }
        .msg.err { color: #b3261e; }
        .actions { display: grid; gap: 8px; }
        .actions button {
          padding: 9px 12px; border-radius: 8px; border: 1px solid #c9ced8;
          background: #fff; color: #1d2330; font-size: 14px; font-weight: 600; cursor: pointer; text-align: left;
        }
        .actions button.primary { background: #2196f3; border-color: #2196f3; color: #fff; }
        .actions button:hover { filter: brightness(.96); }
        @media print { .pill, .panel { display: none; } }
      </style>
      <div class="panel" hidden>
        <div class="label" id="nowLabel">This week</div>
        <div class="now" id="now">…</div>
        <div class="label">Coming up</div>
        <ul id="list"></ul>
        <div class="msg" id="msg" hidden></div>
        <div class="actions">
          <button type="button" class="primary" id="print">Printable timetable</button>
          <button type="button" id="pocket">Pocket card (ID-card size)</button>
        </div>
      </div>
      <button type="button" class="pill" title="Timetable Plus: which week it is, printable timetable and pocket card">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14v11zM7 11h5v5H7z"/></svg>
        <span>Timetable Plus</span>
      </button>`;

    $('.pill').addEventListener('click', () => {
      const panel = $('.panel');
      panel.hidden = !panel.hidden;
      if (!panel.hidden && loadedFor !== pupilFromHash()) loadList();
    });
    $('#print').addEventListener('click', () => ask({ type: 'openTimetable', pupilId: pupilFromHash() }));
    $('#pocket').addEventListener('click', () => ask({ type: 'openTimetable', pupilId: pupilFromHash(), pocket: true }));
    // Close when clicking elsewhere on the page.
    document.addEventListener('click', (e) => {
      if (!e.composedPath().includes(host)) $('.panel').hidden = true;
    });
    return host;
  }

  const weekText = (w) => (w.holiday ? 'Holiday' : w.week != null ? `Week ${w.week}` : 'Not labelled');

  function showError(res) {
    const msg = $('#msg');
    msg.hidden = false;
    msg.className = 'msg err';
    msg.textContent = res.stale
      ? 'The extension was updated. Reload this page to use it.'
      : res.expired
        ? 'ClassCharts login not found or expired. Reload this page, then try again.'
        : `Couldn't check the rota: ${res.error}`;
  }

  async function loadList() {
    const pupilId = pupilFromHash();
    $('#nowLabel').textContent = isWeekend() ? 'Next week' : 'This week';
    $('#now').textContent = '…';
    $('#list').innerHTML = '';
    $('#msg').hidden = false;
    $('#msg').className = 'msg';
    $('#msg').textContent = 'Checking the rota…';
    const res = await ask({ type: 'rotaWeeks', pupilId, count: UPCOMING });
    if (!res?.weeks) { $('#now').textContent = '?'; return showError(res || { error: 'no response' }); }
    loadedFor = pupilId;
    $('#msg').hidden = true;
    const [first, ...rest] = res.weeks;
    $('#now').textContent = weekText(first);
    for (const w of rest) {
      const li = document.createElement('li');
      if (w.holiday) li.className = 'holiday';
      li.innerHTML = '<span></span><span class="wk"></span>';
      li.firstChild.textContent = `w/c ${fmtDate(parseDate(w.monday))}`;
      li.lastChild.textContent = weekText(w);
      $('#list').appendChild(li);
    }
    if (res.weeks.every((w) => w.holiday || w.week == null) && res.weeks.some((w) => !w.holiday)) {
      $('#msg').hidden = false;
      $('#msg').textContent = "This school's ClassCharts doesn't label rota weeks, so the week number can't be shown.";
    }
  }

  function update() {
    const pupilId = pupilFromHash();
    if (!pupilId) {
      if (host?.isConnected) host.remove();
      return;
    }
    if (!host?.isConnected) document.documentElement.appendChild(host ?? build());
    // Switched child: close the panel; it reloads for the new child next time it opens.
    if (loadedFor && loadedFor !== pupilId) $('.panel').hidden = true;
  }

  window.addEventListener('hashchange', update);
  update();
})();
