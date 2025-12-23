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
    it("should convert Core Data timestamp 0 to 2001-01-01", () => {
      const result = coreDataToISO(0);
      expect(result).toBe("2001-01-01");
    });

    it("should convert positive timestamp to correct date", () => {
      // 365 days after Core Data epoch
      const oneDayInSeconds = 86400;
      const timestamp = oneDayInSeconds * 365;
      const result = coreDataToISO(timestamp);
      expect(result).toBe("2002-01-01");
    });

    it("should convert known timestamp to correct date", () => {
      // 2024-01-15 00:00:00 UTC
      const timestamp = isoToCoreData("2024-01-15");
      const result = coreDataToISO(timestamp);
      expect(result).toBe("2024-01-15");
    });
  });

  describe("isoToCoreData", () => {
    it("should convert 2001-01-01 to 0", () => {
      const result = isoToCoreData("2001-01-01");
      expect(result).toBe(0);
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
  });
});
