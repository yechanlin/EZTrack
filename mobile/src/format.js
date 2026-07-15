/**
 * The API sends money as strings ("25.50"), not numbers — deliberately. Decimal
 * values lose precision the moment they become JS floats, and the balance is the
 * one number that has to be exactly right. Parse only at the edge, for display.
 */
export function formatMoney(value, { signed = false } = {}) {
  const n = Number(value ?? 0);
  const formatted = n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (signed && n > 0) return `+$${formatted}`;
  if (n < 0) return `-$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  return `$${formatted}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthName(month) {
  return MONTH_NAMES[month - 1] ?? "";
}

export function monthLabel(year, month) {
  return `${monthName(month)} ${year}`;
}

/**
 * Today, per the DEVICE, as YYYY-MM-DD.
 *
 * MOBILE GOTCHA: don't reach for toISOString() here. It converts to UTC first, so
 * at 9pm on the 12th in Seoul it returns the 12th's UTC equivalent — which is the
 * *13th* locally... or the 11th, going the other way. Expenses would silently land
 * on the wrong day, and near month boundaries, in the wrong month. Read the local
 * calendar fields directly instead.
 */
export function todayLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function currentYearMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** "2026-07-12" -> "Jul 12" */
export function shortDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTH_NAMES[m - 1].slice(0, 3)} ${d}`;
}
