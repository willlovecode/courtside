import { describe, expect, it } from "vitest";
import { localToUtc, parseDotDateTime } from "../src/time";

const warsaw = (text: string) => localToUtc(parseDotDateTime(text), "Europe/Warsaw").toISOString();

describe("localToUtc", () => {
  it("converts winter time (UTC+1)", () => {
    expect(warsaw("19.11.2025, 17:30")).toBe("2025-11-19T16:30:00.000Z");
  });

  it("converts summer time (UTC+2)", () => {
    expect(warsaw("10.05.2026, 14:45")).toBe("2026-05-10T12:45:00.000Z");
  });

  it("uses the offset valid on the day of a clock change", () => {
    // Summer time began on 29 March 2026 at 02:00 local time.
    expect(warsaw("28.03.2026, 20:00")).toBe("2026-03-28T19:00:00.000Z");
    expect(warsaw("29.03.2026, 14:45")).toBe("2026-03-29T12:45:00.000Z");
    // Winter time began on 25 October 2026 at 03:00 local time.
    expect(warsaw("25.10.2026, 14:45")).toBe("2026-10-25T13:45:00.000Z");
  });

  it("works for zones east of UTC+9 as well", () => {
    expect(localToUtc({ year: 2026, month: 1, day: 10, hour: 19, minute: 0 }, "Asia/Tokyo").toISOString()).toBe(
      "2026-01-10T10:00:00.000Z",
    );
  });
});

describe("parseDotDateTime", () => {
  it("reads the site's format", () => {
    expect(parseDotDateTime("19.11.2025, 17:30")).toEqual({ year: 2025, month: 11, day: 19, hour: 17, minute: 30 });
  });

  it("rejects anything else", () => {
    expect(() => parseDotDateTime("2025-11-19 17:30")).toThrow();
  });
});
