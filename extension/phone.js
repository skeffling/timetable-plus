// Phone image: draws the timetable onto a phone-shaped canvas (for a lock screen or sharing).
// Uses the page's state and helpers from timetable.js (loaded, buildSlots, shortSubject, ...).

const PHONE = { width: 1170, height: 2532 }; // 19.5:9, the shape of most current phones
const CELL_INK = '#1d2330'; // lesson cells are pastel in both themes, so their text stays dark

let phoneUrl = null;

function drawPhoneImage() {
  const { width: W, height: H } = PHONE;
  const dark = $('#phoneDark').checked;
  const theme = dark
    ? { bg: '#12161d', ink: '#f2f4f8', muted: '#9aa3b5', empty: '#1f2530', off: '#262c38' }
    : { bg: '#f4f6f9', ink: '#1d2330', muted: '#5d6677', empty: '#e6e9ef', off: '#dde1e8' };
  const opts = { room: $('#showRoom').checked, teacher: $('#showTeacher').checked };

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);

  // Lock screens put the clock in roughly the top 30% and shortcuts along the bottom.
  const pad = 40;
  const top = $('#phoneLock').checked ? Math.round(H * 0.3) : 130;
  const bottom = H - 150;
  const slots = buildSlots(loaded.flat().flatMap((d) => d.lessons));
  const weeks = loaded.length;
  const titleH = 76, weekHeadH = 58, dayHeadH = 40, gap = 30;
  const rowH = (bottom - top - titleH - weeks * (weekHeadH + dayHeadH) - (weeks - 1) * gap) / weeks / slots.length;
  const timeW = 92;
  const colW = (W - 2 * pad - timeW) / 5;
  const subjectPx = clamp(Math.round(rowH * 0.3), 20, 38);
  const metaPx = Math.round(subjectPx * 0.72);
  const font = (weight, px) => `${weight} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  let y = top;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = theme.ink;
  ctx.font = font(700, 46);
  ctx.fillText(fitText(ctx, pageTitle(), W - 2 * pad), pad, y + 48);
  y += titleH;

  loaded.forEach((days, w) => {
    ctx.fillStyle = theme.ink;
    ctx.font = font(700, 38);
    ctx.fillText(weekTitle(days, w).text, pad, y + 40);
    y += weekHeadH;

    ctx.fillStyle = theme.muted;
    ctx.font = font(600, 26);
    ctx.textAlign = 'center';
    DAY_NAMES.forEach((d, i) => ctx.fillText(d, pad + timeW + colW * (i + 0.5), y + 28));
    ctx.textAlign = 'left';
    y += dayHeadH;

    slots.forEach((slot, r) => {
      const rowY = y + r * rowH;
      ctx.fillStyle = theme.muted;
      ctx.font = font(600, Math.min(26, subjectPx));
      ctx.textBaseline = 'middle';
      ctx.fillText(slot.time.split('–')[0], pad, rowY + rowH / 2);
      ctx.textBaseline = 'alphabetic';

      days.forEach((day, i) => {
        const x = pad + timeW + colW * i;
        if (!day.lessons.length) {
          // Holiday: one cell down the whole day.
          if (r === 0) {
            cell(ctx, x, y, colW, rowH * slots.length, theme.off);
            ctx.fillStyle = theme.muted;
            ctx.font = font(600, metaPx);
            ctx.textAlign = 'center';
            ctx.fillText('No lessons', x + colW / 2, y + (rowH * slots.length) / 2);
            ctx.textAlign = 'left';
          }
          return;
        }
        const lesson = day.lessons.find((l) => slotKey(l) === slot.key);
        if (!lesson) return cell(ctx, x, rowY, colW, rowH, theme.empty);

        cell(ctx, x, rowY, colW, rowH, colourFor(lesson.subject));
        const inner = colW - 24;
        ctx.fillStyle = CELL_INK;
        ctx.font = font(700, subjectPx);
        ctx.fillText(fitText(ctx, shortSubject(lesson), inner), x + 12, rowY + 10 + subjectPx);
        ctx.font = font(500, metaPx);
        const metaY = rowY + rowH - 14;
        const room = opts.room ? lesson.room : '';
        const teacher = opts.teacher ? shortTeacher(lesson.teacher || '') : '';
        if (teacher) {
          ctx.textAlign = 'right';
          ctx.fillText(teacher, x + colW - 12, metaY);
          ctx.textAlign = 'left';
        }
        const teacherW = teacher ? ctx.measureText(teacher).width + 8 : 0;
        if (room) ctx.fillText(fitText(ctx, room, inner - teacherW), x + 12, metaY);
      });
    });
    y += rowH * slots.length + gap;
  });
  return canvas;
}

function cell(ctx, x, y, w, h, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x + 3, y + 3, w - 6, h - 6, 12);
  ctx.fill();
}

// Shorten text with "…" until it fits.
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

async function phoneBlob() {
  return new Promise((resolve) => drawPhoneImage().toBlob(resolve, 'image/png'));
}

function phoneFileName() {
  return `${(pupilFirstName() || 'timetable').toLowerCase()}-timetable.png`;
}

async function showPhoneImage() {
  if (!loaded) return;
  const blob = await phoneBlob();
  if (phoneUrl) URL.revokeObjectURL(phoneUrl);
  phoneUrl = URL.createObjectURL(blob);
  $('#phonePreview').src = phoneUrl;
  const file = new File([blob], phoneFileName(), { type: 'image/png' });
  $('#phoneShare').hidden = !navigator.canShare?.({ files: [file] });
  if (!$('#phoneDialog').open) $('#phoneDialog').showModal();
}

$('#phone').addEventListener('click', showPhoneImage);
$('#phoneClose').addEventListener('click', () => $('#phoneDialog').close());
$('#phoneDownload').addEventListener('click', () => {
  const a = h('a', { href: phoneUrl, download: phoneFileName() });
  document.body.append(a);
  a.click();
  a.remove();
});
$('#phoneShare').addEventListener('click', async () => {
  const file = new File([await phoneBlob()], phoneFileName(), { type: 'image/png' });
  try {
    await navigator.share({ files: [file], title: pageTitle() });
  } catch { /* cancelled */ }
});
// Redraw while open when an option that affects the image changes.
for (const id of ['phoneLock', 'phoneDark', 'showRoom', 'showTeacher']) {
  $('#' + id).addEventListener('change', () => { if ($('#phoneDialog').open) showPhoneImage(); });
}
