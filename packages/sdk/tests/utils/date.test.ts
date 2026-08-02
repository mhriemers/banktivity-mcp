import { describe, it, expect, vi, afterEach } from "vitest";
import { nowAsCoreData, coreDataToISO, isoToCoreData } from "../../src/utils/date.js";

const CORE_DATA_EPOCH_OFFSET = 978307200;

describe("date utils", () => {
  describe("nowAsCoreData", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return current time in Core Data format", () => {
      const mockDate = new Date("2024-01-15T12:00:00Z");
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);

      const result = nowAsCoreData();
      const expected = Math.floor(mockDate.getTime() / 1000) - CORE_DATA_EPOCH_OFFSET;

      expect(result).toBe(expected);
    });

    it("should return 0 for Core Data epoch (2001-01-01)", () => {
      const coreDataEpoch = new Date("2001-01-01T00:00:00Z");
      vi.useFakeTimers();
      vi.setSystemTime(coreDataEpoch);

      const result = nowAsCoreData();

      expect(result).toBe(0);
    });
  });

  describe("coreDataToISO", () => {
    it("should convert Core Data timestamp for noon UTC to correct date", () => {
      // Banktivity stores dates at noon UTC. Timestamp for 2024-01-15T12:00:00Z:
      const noonUTC = Date.UTC(2024, 0, 15, 12, 0, 0) / 1000;
      const coreDataTimestamp = noonUTC - CORE_DATA_EPOCH_OFFSET;
      const result = coreDataToISO(coreDataTimestamp);
      expect(result).toBe("2024-01-15");
    });

    it("should roundtrip with isoToCoreData", () => {
      const timestamp = isoToCoreData("2024-01-15");
      const result = coreDataToISO(timestamp);
      expect(result).toBe("2024-01-15");
    });
  });

  describe("isoToCoreData", () => {
    it("should convert 2001-01-01 to noon UTC offset from Core Data epoch", () => {
      // Core Data epoch is 2001-01-01T00:00:00Z. isoToCoreData stores noon UTC,
      // so the result should be 12 hours (43200 seconds).
      const result = isoToCoreData("2001-01-01");
      expect(result).toBe(43200);
    });

    it("should convert dates after epoch to positive numbers", () => {
      const result = isoToCoreData("2024-01-01");
      expect(result).toBeGreaterThan(0);
    });

    it("should convert dates before epoch to negative numbers", () => {
      const result = isoToCoreData("2000-01-01");
      expect(result).toBeLessThan(0);
    });

    it("should be inverse of coreDataToISO", () => {
      const originalDate = "2023-06-15";
      const timestamp = isoToCoreData(originalDate);
      const result = coreDataToISO(timestamp);
      expect(result).toBe(originalDate);
    });

    it("should store noon UTC to match Banktivity convention (issue #17)", () => {
      // Banktivity stores all date-only values at noon UTC.
      // The fix ensures isoToCoreData produces the same timestamp.
      const result = isoToCoreData("2026-07-15");
      const unixTimestamp = result + CORE_DATA_EPOCH_OFFSET;
      const asUTCDate = new Date(unixTimestamp * 1000);

      expect(asUTCDate.getUTCFullYear()).toBe(2026);
      expect(asUTCDate.getUTCMonth()).toBe(6); // July
      expect(asUTCDate.getUTCDate()).toBe(15);
      expect(asUTCDate.getUTCHours()).toBe(12);
      expect(asUTCDate.getUTCMinutes()).toBe(0);
      expect(asUTCDate.getUTCSeconds()).toBe(0);
    });

    it("should produce timestamps that match Banktivity-stored values (issue #17)", () => {
      // When filtering by date, isoToCoreData must produce the same timestamp
      // that Banktivity stores for that date, so >= and <= comparisons work.
      // Known from database: May 1, 2026 transactions have ZPDATE = 799329600
      // which is 2026-05-01T12:00:00Z (noon UTC).
      const result = isoToCoreData("2026-05-01");
      expect(result).toBe(799329600);
    });

    it("should be timezone-independent (issue #17)", () => {
      // The result should be the same regardless of local timezone because
      // we use Date.UTC explicitly.
      const dates = ["2026-01-01", "2026-07-15", "2026-12-31", "2024-03-10", "2024-11-03"];
      for (const date of dates) {
        const timestamp = isoToCoreData(date);
        const result = coreDataToISO(timestamp);
        expect(result).toBe(date);
      }
    });
  });

  describe("coreDataToISO (timezone independence - issue #17)", () => {
    it("should read back noon-UTC timestamps correctly regardless of local timezone", () => {
      // Banktivity stores 2026-07-15 as noon UTC = 799329600 + 43200 for Jul vs May
      // Just verify roundtrip works
      const coreDataTimestamp = isoToCoreData("2026-07-15");
      const result = coreDataToISO(coreDataTimestamp);
      expect(result).toBe("2026-07-15");
    });

    it("should handle dates near DST transitions correctly", () => {
      // DST transitions should not affect results since we use UTC throughout
      const dates = ["2024-03-10", "2024-11-03", "2026-03-08", "2026-11-01"];
      for (const date of dates) {
        const timestamp = isoToCoreData(date);
        const result = coreDataToISO(timestamp);
        expect(result).toBe(date);
      }
    });
  });
});
