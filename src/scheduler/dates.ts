/**
 * Local calendar dates.
 *
 * A LocalDate is a plain 'YYYY-MM-DD' string: a square on the wall calendar, with no
 * time and no timezone. Due dates are stored and compared only in this form.
 *
 * Arithmetic here is done on the calendar itself (a day count from the civil date),
 * never by adding milliseconds to an instant, so daylight-saving shifts and timezone
 * changes cannot move a due date. The only place an instant meets a timezone is
 * toLocalDate, which asks "what date is on the wall right now, here?".
 */

export type LocalDate = string & { readonly __brand: 'LocalDate' };

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since 1970-01-01 for a civil date (proleptic Gregorian). */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(days: number): [year: number, month: number, day: number] {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return [yoe + era * 400 + (month <= 2 ? 1 : 0), month, day];
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

function format(year: number, month: number, day: number): LocalDate {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as LocalDate;
}

function toDayNumber(date: LocalDate): number {
  const m = PATTERN.exec(date);
  if (!m) throw new RangeError(`not a local date: ${date}`);
  return daysFromCivil(Number(m[1]), Number(m[2]), Number(m[3]));
}

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string') return false;
  const m = PATTERN.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Round-trip so that 2026-02-30 and friends are rejected.
  const back = civilFromDays(daysFromCivil(y, mo, d));
  return back[0] === y && back[1] === mo && back[2] === d;
}

/** Parses 'YYYY-MM-DD', throwing on anything that is not a real calendar date. */
export function localDate(value: string): LocalDate {
  if (!isLocalDate(value)) throw new RangeError(`not a local date: ${value}`);
  return value;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return format(...civilFromDays(toDayNumber(date) + days));
}

/** Whole calendar days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function laterOf(a: LocalDate, b: LocalDate): LocalDate {
  return a >= b ? a : b;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone ?? '';
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    // The device zone can change while the app is running, so it is never cached.
    if (timeZone) formatters.set(key, f);
  }
  return f;
}

/**
 * The calendar date showing on the wall at this instant.
 * `timeZone` is an IANA name; leave it out to use the device's current zone.
 */
export function toLocalDate(instant: Date, timeZone?: string): LocalDate {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return format(get('year'), get('month'), get('day'));
}
