// Time helpers. Pokémon GO publishes two kinds of times:
//  - "local time" events (e.g. Community Day 14:00–17:00 in every timezone).
//    ScrapedDuck writes these WITHOUT a trailing "Z": "2026-11-21T14:00:00.000".
//  - global events that start at one instant worldwide.
//    These end with "Z": "2026-11-03T21:00:00.000Z".
// Local-time events are interpreted as wall-clock time in the user's timezone
// (Europe/Oslo by default), including correct daylight-saving handling.

export const DEFAULT_TZ = 'Europe/Oslo';

const dtfCache = new Map();
function partsFormatter(tz) {
  if (!dtfCache.has(tz)) {
    dtfCache.set(tz, new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return dtfCache.get(tz);
}

/** Offset (ms) of `tz` from UTC at the given instant. Oslo winter = +3600000. */
export function tzOffsetMs(utcMs, tz = DEFAULT_TZ) {
  const p = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(new Date(utcMs))) p[type] = value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Convert a wall-clock time in `tz` to a UTC timestamp (ms). */
export function wallTimeToUtcMs(y, mo, d, h = 0, mi = 0, s = 0, tz = DEFAULT_TZ) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let result = guess - tzOffsetMs(guess, tz);
  // Re-check once: the offset may differ on the other side of a DST switch.
  const second = guess - tzOffsetMs(result, tz);
  if (second !== result) result = second;
  return result;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Parse a source timestamp.
 * @returns {{ms:number, isLocalTime:boolean, raw:string} | null}
 */
export function parseEventTime(raw, tz = DEFAULT_TZ) {
  if (raw == null || raw === '') return null;
  const m = ISO_RE.exec(String(raw).trim());
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0', zone] = m;
  if (zone) {
    const ms = Date.parse(String(raw).trim());
    return Number.isNaN(ms) ? null : { ms, isLocalTime: false, raw: String(raw) };
  }
  return { ms: wallTimeToUtcMs(+y, +mo, +d, +h, +mi, +s, tz), isLocalTime: true, raw: String(raw) };
}

/** Event status relative to `now`. */
export function eventPhase(startMs, endMs, now = Date.now()) {
  if (startMs == null && endMs == null) return 'unscheduled';
  if (startMs != null && now < startMs) return 'upcoming';
  if (endMs != null && now >= endMs) return 'ended';
  return 'live';
}

/** "2d 4h", "3h 12m", "12m 05s" */
export function formatCountdown(ms) {
  if (ms == null || !Number.isFinite(ms)) return '';
  if (ms <= 0) return 'now';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

const fmtCache = new Map();
function fmt(tz, opts) {
  const key = tz + JSON.stringify(opts);
  if (!fmtCache.has(key)) fmtCache.set(key, new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts }));
  return fmtCache.get(key);
}

/** "Sat 21 Nov, 14:00" in the given timezone. */
export function formatDateTime(ms, tz = DEFAULT_TZ) {
  if (ms == null) return 'Date not announced';
  return fmt(tz, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}

export function formatTime(ms, tz = DEFAULT_TZ) {
  return fmt(tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}

/** "Sat 21 Nov 14:00 – 17:00" or a two-date range. */
export function formatRange(startMs, endMs, tz = DEFAULT_TZ) {
  if (startMs == null && endMs == null) return 'Dates not announced';
  if (startMs == null) return `Until ${formatDateTime(endMs, tz)}`;
  if (endMs == null) return `From ${formatDateTime(startMs, tz)}`;
  const sameDay = fmt(tz, { dateStyle: 'short' }).format(new Date(startMs)) ===
    fmt(tz, { dateStyle: 'short' }).format(new Date(endMs));
  return sameDay
    ? `${formatDateTime(startMs, tz)} – ${formatTime(endMs, tz)}`
    : `${formatDateTime(startMs, tz)} → ${formatDateTime(endMs, tz)}`;
}

/** "5 min ago", "3 h ago", "2 d ago" */
export function formatAgo(ms, now = Date.now()) {
  if (ms == null) return 'never';
  const diff = Math.max(0, now - ms);
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
