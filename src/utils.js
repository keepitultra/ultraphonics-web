// --- Date & Time Helpers ---

export function parseLocalDateOnly(dateStr) {
    if (!dateStr) return null;
    const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      const [, y, m, d] = iso.map(Number);
      return new Date(y, m - 1, d, 0, 0, 0, 0);
    }
    const us = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us) {
      const [, m, d, y] = us.map(Number);
      return new Date(y, m - 1, d, 0, 0, 0, 0);
    }
    return new Date(dateStr);
}
  
export function parseTimeToHM(timeStr) {
    if (!timeStr) return { hours: 0, minutes: 0, isAM: false, isPM: false };
    const parts = timeStr.trim().split(/\s+/);
    const [hStr, mStr = "00"] = parts[0].split(":");
    let h = parseInt(hStr, 10);
    const ampm = (parts[1] || "").toUpperCase();
    const isAM = ampm === "AM";
    const isPM = ampm === "PM";
    if (isPM && h !== 12) h += 12;
    if (isAM && h === 12) h = 0;
    return { hours: h, minutes: parseInt(mStr, 10), isAM, isPM };
}

export function dateToIsoWithLocalTz(dLocal) {
    const pad = n => String(n).padStart(2, "0");
    const y = dLocal.getFullYear();
    const mo = pad(dLocal.getMonth() + 1);
    const da = pad(dLocal.getDate());
    const H = pad(dLocal.getHours());
    const M = pad(dLocal.getMinutes());
    const S = pad(dLocal.getSeconds());
    const tzMinutes = -dLocal.getTimezoneOffset();
    const sign = tzMinutes >= 0 ? "+" : "-";
    const offAbs = Math.abs(tzMinutes);
    const offH = pad(Math.floor(offAbs / 60));
    const offM = pad(offAbs % 60);
    return `${y}-${mo}-${da}T${H}:${M}:${S}${sign}${offH}:${offM}`;
}

export function toIsoWithTz(dateStr, timeStr) {
    const base = parseLocalDateOnly(dateStr);
    if (!base || isNaN(base)) return null;
    const { hours, minutes } = parseTimeToHM(timeStr);
    base.setHours(hours, minutes, 0, 0);
    return dateToIsoWithLocalTz(base);
}

export function firstUrl(...candidates) {
    return candidates.find(u => typeof u === "string" && u.trim().length > 0);
}

// --- Slug Helpers ---

export function slugify(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9\s-]/g, '')                     // keep alphanum, spaces, hyphens
    .trim()
    .replace(/[\s-]+/g, '-');                          // collapse spaces/hyphens
}

export function makeUniqueSlug(base, existingIds) {
  const slug = slugify(base);
  if (!existingIds.has(slug)) return slug;
  let n = 2;
  while (existingIds.has(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}

export function formatCityState(city, state) {
    const c = (city || "").trim();
    const s = (state || "").trim();
    if (c && s) return `${c}, ${s}`;
    return c || s || "";
}