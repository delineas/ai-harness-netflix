const HOURS_UNIT = "h";

function roundHours(n: number): number {
  return Math.round(n);
}

const nf = new Intl.NumberFormat("en-US");

export function formatNumber(n: number): string {
  return nf.format(n);
}

export function formatHours(n: number): string {
  return `${formatNumber(roundHours(n))} ${HOURS_UNIT}`;
}

export function formatWeeks(n: number): string {
  return n === 1 ? "1 week" : `${n} weeks`;
}
