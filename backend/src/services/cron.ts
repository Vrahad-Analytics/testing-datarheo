/**
 * Minimal 5-field cron matcher: "minute hour day-of-month month day-of-week".
 * Supports: *, lists (a,b), ranges (a-b), steps (*\/n, a-b/n), names not supported.
 * Day-of-week: 0-7, 0 and 7 both mean Sunday.
 * When both day-of-month and day-of-week are restricted, a day matches if
 * EITHER matches (standard cron semantics).
 */

const FIELD_RANGES = [
  { min: 0, max: 59 }, // minute
  { min: 0, max: 23 }, // hour
  { min: 1, max: 31 }, // day of month
  { min: 1, max: 12 }, // month
  { min: 0, max: 7 } // day of week
];

function parseField(field: string, min: number, max: number): Set<number> | null {
  const values = new Set<number>();
  for (const part of field.split(',')) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    const step = stepMatch ? parseInt(stepMatch[2], 10) : 1;
    if (step <= 0 || isNaN(step)) return null;
    const base = stepMatch ? stepMatch[1] : part;

    let lo: number, hi: number;
    if (base === '*') {
      lo = min;
      hi = max;
    } else {
      const range = base.match(/^(\d+)-(\d+)$/);
      if (range) {
        lo = parseInt(range[1], 10);
        hi = parseInt(range[2], 10);
      } else if (/^\d+$/.test(base)) {
        lo = hi = parseInt(base, 10);
        if (stepMatch) hi = max; // "a/n" means a-max step n
      } else {
        return null;
      }
    }
    if (isNaN(lo) || isNaN(hi) || lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return values.size ? values : null;
}

export interface ParsedCron {
  minutes: Set<number>;
  hours: Set<number>;
  doms: Set<number>;
  months: Set<number>;
  dows: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
}

export function parseCron(expr: string): ParsedCron | null {
  if (!expr || typeof expr !== 'string') return null;
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const parsed = fields.map((f, i) => parseField(f, FIELD_RANGES[i].min, FIELD_RANGES[i].max));
  if (parsed.some((p) => p === null)) return null;
  const dows = new Set([...(parsed[4] as Set<number>)].map((d) => (d === 7 ? 0 : d)));
  return {
    minutes: parsed[0] as Set<number>,
    hours: parsed[1] as Set<number>,
    doms: parsed[2] as Set<number>,
    months: parsed[3] as Set<number>,
    dows,
    domRestricted: fields[2] !== '*',
    dowRestricted: fields[4] !== '*'
  };
}

export function isValidCron(expr: string): boolean {
  return parseCron(expr) !== null;
}

function dayMatches(cron: ParsedCron, d: Date): boolean {
  if (!cron.months.has(d.getMonth() + 1)) return false;
  const domHit = cron.doms.has(d.getDate());
  const dowHit = cron.dows.has(d.getDay());
  if (cron.domRestricted && cron.dowRestricted) return domHit || dowHit;
  if (cron.domRestricted) return domHit;
  if (cron.dowRestricted) return dowHit;
  return true;
}

/**
 * Next occurrence strictly after `after`, or null if none within ~5 years.
 */
export function nextOccurrence(expr: string, after: Date = new Date()): Date | null {
  const cron = parseCron(expr);
  if (!cron) return null;

  const sortedHours = [...cron.hours].sort((a, b) => a - b);
  const sortedMinutes = [...cron.minutes].sort((a, b) => a - b);

  const day = new Date(after.getFullYear(), after.getMonth(), after.getDate());
  for (let i = 0; i < 366 * 5; i++) {
    if (dayMatches(cron, day)) {
      for (const h of sortedHours) {
        for (const m of sortedMinutes) {
          const candidate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
          if (candidate.getTime() > after.getTime()) return candidate;
        }
      }
    }
    day.setDate(day.getDate() + 1);
  }
  return null;
}
