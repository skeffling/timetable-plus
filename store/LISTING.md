# Store listing kit

Everything to copy and paste when submitting. Build the upload zips first:

```
store/build.sh        # → dist/timetable-plus-<version>-chrome.zip and -firefox.zip
```

Images in this folder:

| File | Use |
|---|---|
| `icon-128.png` | Store icon (both stores) |
| `screenshots/1-printable-timetable.png` | Screenshot, 1280×800 |
| `screenshots/2-pocket-card.png` | Screenshot, 1280×800 |
| `screenshots/3-extras-panel.png` | Screenshot, 1280×800 |
| `promo-tile-440x280.png` | Chrome "small promo tile" |

All screenshots use made-up demo data (open `extension/timetable.html?demo` to recreate them).

You'll need a **public URL for the privacy policy** (`PRIVACY.md`). The simplest option is to push
this repo to GitHub and link to that file, or paste it into a GitHub Gist.

---

## Shared text

**Name:** Timetable Plus for ClassCharts

**Short description / summary** (Chrome max 132 characters, Firefox max 250):

> Unofficial helper for ClassCharts parents: printable two-week timetable, ID-card pocket timetable and which rota week it is.

**Detailed description:**

> ClassCharts shows your child's timetable one day at a time. Timetable Plus turns it into
> something you can print and stick on the fridge, or cut out and keep on a lanyard.
>
> • Printable timetable: the whole rota on one page, colour-coded by subject, with teachers and rooms.
> • Works out whether the timetable repeats every week or every two weeks, from ClassCharts' own
>   week labels, and fills gaps left by holidays.
> • Pocket card: an ID-card-sized (85.6 × 54 mm) version with short subject names, rooms and teacher
>   initials. Print, cut out, fold, and it fits a standard lanyard holder.
> • Phone image: a phone-sized picture of the timetable, with space for the lock-screen clock,
>   to share or set as a lock screen.
> • "Which week is it?": a button on the ClassCharts timetable shows this week's rota week and the
>   coming weeks, with holidays marked.
> • Rename anything (e.g. "Week A"/"Week B", "Further Maths" → "F.Maths"); your settings are remembered.
> • Handles several children on one parent account.
>
> How to use: log in to ClassCharts as a parent, open the timetable, and click the blue
> "Timetable Plus" button in the bottom-right corner (or the toolbar icon).
>
> Privacy: the extension only talks to classcharts.com, using the login you already have open.
> No accounts, no tracking, no data sent anywhere else.
>
> This is an independent project and is not affiliated with or endorsed by ClassCharts or Tes.

**Category:** Chrome: *Education* (or *Productivity*). Firefox: *Other* / *Search Tools* aren't a fit;
use **Other** plus the tags `school`, `timetable`, `print`.

---

## Chrome Web Store: extra fields

Developer dashboard: https://chrome.google.com/webstore/devconsole (one-off US$5 registration fee).

**Single purpose:**

> Makes a ClassCharts parent's timetable easier to use: printable and pocket-sized versions, and
> showing which rota week it is.

**Permission justifications:**

- `webRequest`: Reads (does not modify or block) the Authorization header the ClassCharts parent
  website sends to its own API, so the extension can request more than one day of the timetable
  with the parent's existing login.
- `storage`: Keeps that session header in session storage (cleared when the browser closes), caches
  rota-week lookups for up to a week, and saves the user's display settings and custom names locally.
- Host permission `https://www.classcharts.com/*`: Needed to observe the ClassCharts API requests,
  to fetch timetable data from ClassCharts, and to show the Timetable Plus button on the ClassCharts
  timetable page. No other sites are accessed.

**Remote code:** No, I am not using remote code.

**Data usage** (Privacy practices tab). Tick:
- *Authentication information*: the ClassCharts session header, used only to call ClassCharts.
- *Personally identifiable information*: the child's name and timetable (teachers, rooms) as shown by ClassCharts.

Then certify all three statements: data is not sold to third parties, not used for unrelated
purposes, and not used for creditworthiness or lending.

**Privacy policy URL:** https://github.com/skeffling/timetable-plus/blob/main/PRIVACY.md

**Test instructions for reviewers:**

> A ClassCharts parent account is needed for live data, and we can't share one because it holds a
> real child's data. To see the full layout with sample data, open
> chrome-extension://<id>/timetable.html?demo (add &pocket for the pocket card). The extension only
> runs on https://www.classcharts.com/mobile/parent.

---

## Firefox Add-ons (AMO): extra fields

Developer hub: https://addons.mozilla.org/developers/ (free). Choose **On this site** to be listed
publicly, or **On your own** to get a signed .xpi just for yourself (no review queue, installs
permanently in normal Firefox).

**Upload:** `dist/timetable-plus-<version>-firefox.zip`

**Source code:** Not required: nothing is minified, bundled or generated.

**Data collection:** the manifest declares `data_collection_permissions: none`. Nothing is sent to
the developer or third parties.

**Support site / email:** your GitHub repo issues page, and/or an email you're happy to publish.

**License:** MIT (see LICENSE).

**Notes to reviewer:**

> The extension observes (non-blocking) the Authorization header that the ClassCharts parent web
> app sends to its own API at https://www.classcharts.com/apiv2parent/*, stores it in
> storage.session, and replays it to the same API to fetch several days of timetable. No other
> hosts are contacted. Sample data without an account:
> open moz-extension://<id>/timetable.html?demo (add &pocket for the pocket card).

---

## Before each new release

1. Bump `version` in `extension/manifest.json`.
2. `store/build.sh`
3. Upload the matching zip to each dashboard.
