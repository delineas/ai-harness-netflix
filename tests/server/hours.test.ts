import { describe, expect, it } from "vitest";
import { hoursViewed } from "../../server/domain/hours.ts";

describe("hoursViewed", () => {
  it("sums only the semi-annual rows", () => {
    const rows = [
      { duration: "SEMI_ANNUALLY", hours_viewed: 100 },
      { duration: "SEMI_ANNUALLY", hours_viewed: 50 },
      { duration: "WEEKLY", hours_viewed: 999 },
    ];
    expect(hoursViewed(rows)).toBe(150);
  });

  it("returns 0 for no rows", () => {
    expect(hoursViewed([])).toBe(0);
  });
});
