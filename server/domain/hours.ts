export type ViewRow = { duration: string; hours_viewed: number | null };

export function hoursViewed(rows: ViewRow[]): number {
  let total = 0;
  for (const r of rows) {
    if (r.duration === "SEMI_ANNUALLY") total += r.hours_viewed ?? 0;
  }
  return total;
}
