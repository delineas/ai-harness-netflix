import { describe, expect, it } from "vitest";
import { formatHours, formatNumber, formatWeeks } from "../../web/src/format.ts";

describe("formatNumber", () => {
  it("groups thousands with commas", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });
  it("leaves small numbers alone", () => {
    expect(formatNumber(999)).toBe("999");
  });
});

describe("formatHours", () => {
  it("rounds to whole hours, groups and appends the unit", () => {
    expect(formatHours(1234.6)).toBe("1,235 h");
  });
  it("formats zero", () => {
    expect(formatHours(0)).toBe("0 h");
  });
});

describe("formatWeeks", () => {
  it("uses the singular for 1", () => {
    expect(formatWeeks(1)).toBe("1 week");
  });
  it("uses the plural otherwise", () => {
    expect(formatWeeks(0)).toBe("0 weeks");
    expect(formatWeeks(12)).toBe("12 weeks");
  });
});
