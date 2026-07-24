// Normalisation for the vendor import. Phone-to-E.164 is the PRIMARY match key;
// everything else here (name, date, email) is corroboration or display only.
// Kept pure and side-effect-free so the matcher and its tests can reason about
// a row without a database.

// A Malaysian mobile in E.164, or a structured failure. We never throw on a bad
// phone: the caller records the reason against the staging row and moves on.
export type PhoneResult =
  | { phone: string; error: null }
  | { phone: null; error: null } // legitimately absent (e.g. email-only lead)
  | { phone: null; error: string }; // present but unparseable

// Normalise a Malaysian phone to E.164 (+60...). Handles the entry habits in
// the fixtures: local `0` prefix, `+60`, bare `60`, and spaces/dashes/parens as
// noise. A letter where a digit belongs (e.g. `+6012000O115`) is a hard error,
// not a silent guess.
export function normalizePhone(raw: string): PhoneResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { phone: null, error: null };

  // Strip formatting noise only; keep a leading + and every digit so an
  // illegal character below still surfaces rather than being scrubbed away.
  const stripped = trimmed.replace(/[\s()\-.]/g, "");

  if (!/^\+?\d+$/.test(stripped)) {
    return { phone: null, error: `Unparseable phone "${raw.trim()}"` };
  }

  let digits: string;
  if (stripped.startsWith("+60")) {
    digits = stripped.slice(3);
  } else if (stripped.startsWith("60")) {
    digits = stripped.slice(2);
  } else if (stripped.startsWith("0")) {
    digits = stripped.slice(1);
  } else {
    return { phone: null, error: `Unrecognised phone format "${raw.trim()}"` };
  }

  // Malaysian mobile national number is 9–10 digits after the country code.
  if (digits.length < 9 || digits.length > 10) {
    return { phone: null, error: `Implausible phone length "${raw.trim()}"` };
  }

  return { phone: `+60${digits}`, error: null };
}

// Fold a name to a comparable form: lowercase, punctuation removed, honorific /
// spelling-of-binti noise dropped, whitespace collapsed. Used for dedup within
// the file and as a SECONDARY match signal only — never sufficient alone.
const NAME_NOISE = new Set(["bin", "binti", "b", "bt", "a/l", "a/p", "al", "ap"]);

export function normalizeName(raw: string): string {
  const tokens = raw
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !NAME_NOISE.has(t));
  return tokens.join(" ");
}

// Token-set similarity in [0,1]: how much of the smaller name is covered by the
// larger. Chosen over raw Levenshtein so "Kavitha S." vs "Kavitha Subramaniam"
// and abbreviations score high, while genuinely different names ("Linda Lim"
// vs "Lim Xin Yi") stay low.
export function nameSimilarity(a: string, b: string): number {
  const at = new Set(normalizeName(a).split(" ").filter(Boolean));
  const bt = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (at.size === 0 || bt.size === 0) return 0;

  let shared = 0;
  for (const t of at) if (bt.has(t)) shared += 1;
  return shared / Math.min(at.size, bt.size);
}

// Lower-case, trimmed email for comparison; empty becomes null. Not a match key
// on its own — corroboration for a phone-less row only.
export function normalizeEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  return e === "" ? null : e;
}

// Parse the mixed date formats in the export without guessing month/day order
// where it is ambiguous. Recognised: ISO `2024-03-12` and `2024/03/12`,
// day-first `12/03/2024`, and `18-Jan-2024`. Anything else (including empty)
// returns null with a reason so the row still stages.
export function parseVendorDate(
  raw: string,
): { date: Date | null; error: string | null } {
  const s = raw.trim();
  if (s === "") return { date: null, error: null };

  // ISO-ish: YYYY-MM-DD or YYYY/MM/DD.
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return build(+m[1], +m[2], +m[3], s);

  // Day-first: DD/MM/YYYY or DD-MM-YYYY. The vendor is Malaysian, so day-first
  // is the correct reading; an American MM/DD reading would silently corrupt.
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return build(+m[3], +m[2], +m[1], s);

  // DD-Mon-YYYY, e.g. 18-Jan-2024.
  m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const month = MONTHS.indexOf(m[2].toLowerCase());
    if (month === -1) return { date: null, error: `Unknown month "${m[2]}"` };
    return build(+m[3], month + 1, +m[1], s);
  }

  return { date: null, error: `Unrecognised date "${s}"` };
}

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

function build(
  year: number,
  month: number,
  day: number,
  raw: string,
): { date: Date | null; error: string | null } {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { date: null, error: `Out-of-range date "${raw}"` };
  }
  // Vendor dates are wall-clock days; store as UTC midnight so they render back
  // to the same calendar day in Asia/Kuala_Lumpur.
  return { date: new Date(Date.UTC(year, month - 1, day)), error: null };
}
