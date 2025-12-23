import { describe, it, expect } from "vitest";
import { generateUUID } from "../../src/utils/uuid.js";

describe("uuid utils", () => {
  describe("generateUUID", () => {
    it("should return a valid UUID format", () => {
      const uuid = generateUUID();
      const uuidRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
      expect(uuid).toMatch(uuidRegex);
    });

    it("should return uppercase UUID", () => {
      const uuid = generateUUID();
      expect(uuid).toBe(uuid.toUpperCase());
    });

    it("should generate unique UUIDs", () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID());
      }
      expect(uuids.size).toBe(100);
    });

    it("should have correct length", () => {
      const uuid = generateUUID();
      expect(uuid.length).toBe(36);
    });
  });
});
