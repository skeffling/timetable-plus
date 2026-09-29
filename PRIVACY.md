# Privacy policy: Timetable Plus for ClassCharts

_Last updated: 29 September 2026_

Timetable Plus for ClassCharts ("the extension") is an unofficial browser extension for parents
who use ClassCharts. It is not made by, endorsed by, or affiliated with ClassCharts or Tes.

## What the extension reads

- **Your ClassCharts session.** While you use the ClassCharts parent website, the extension reads the
  `Authorization` header that the site itself sends to ClassCharts, plus the pupil ID in the request
  address. It needs these to ask ClassCharts for more than one day of the timetable.
- **Your child's timetable.** Using that session, it requests timetable data (lessons, teachers,
  rooms, times) directly from `www.classcharts.com`.

## Where data goes

- **Nowhere except ClassCharts.** Timetable requests go only to `www.classcharts.com`, the same
  service your browser is already talking to. The extension has no server of its own, no analytics
  and no advertising, and it never sends data to the developer or to any third party.
- The session header is kept in the browser's **session storage**, which is cleared when the
  browser closes. Rota-week lookups (which week is Week 1 or 2) are cached there for up to a week.
- Your **display settings and any names you type** (timetable title, week headings, short subject
  names) are saved in the browser's local extension storage on your own computer, so they're there
  next time. Uninstalling the extension deletes them.

## What it doesn't do

- It does not collect, sell or share personal data.
- It does not change anything in your ClassCharts account. It only reads timetable data.
- It does not run on any site other than `www.classcharts.com`.

## Contact

Questions or problems: open an issue on the project's page, or use the support contact shown on
the extension's store listing.
