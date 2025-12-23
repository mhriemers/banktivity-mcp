import { describe, it, expect, vi, beforeEach } from "vitest";
import { TagRepository } from "../../src/repositories/tags.js";
import { createMockDatabase, createMockStatement, asDatabaseInstance } from "../helpers/mock-db.js";

describe("TagRepository", () => {
  let mockDb: ReturnType<typeof createMockDatabase>;
  let repository: TagRepository;

  beforeEach(() => {
    mockDb = createMockDatabase();
    repository = new TagRepository(asDatabaseInstance(mockDb));
  });

  describe("list", () => {
    it("should return all tags ordered by name", () => {
      const mockTags = [
        { id: 1, name: "Bills" },
        { id: 2, name: "Shopping" },
      ];
      const stmt = createMockStatement({ all: vi.fn().mockReturnValue(mockTags) });
      mockDb.prepare.mockReturnValue(stmt);

      const result = repository.list();

      expect(result).toEqual(mockTags);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY ZPNAME")
      );
    });

    it("should return empty array when no tags exist", () => {
      const stmt = createMockStatement({ all: vi.fn().mockReturnValue([]) });
      mockDb.prepare.mockReturnValue(stmt);

      const result = repository.list();

      expect(result).toEqual([]);
    });
  });

  describe("get", () => {
    it("should return tag by id", () => {
      const mockTag = { id: 1, name: "Bills" };
      const stmt = createMockStatement({ get: vi.fn().mockReturnValue(mockTag) });
      mockDb.prepare.mockReturnValue(stmt);

      const result = repository.get(1);

      expect(result).toEqual(mockTag);
      expect(stmt.get).toHaveBeenCalledWith(1);
    });

    it("should return null when tag not found", () => {
      const stmt = createMockStatement({ get: vi.fn().mockReturnValue(undefined) });
      mockDb.prepare.mockReturnValue(stmt);

      const result = repository.get(999);

      expect(result).toBeNull();
    });
  });

  describe("getByName", () => {
    it("should return tag by name (case-insensitive)", () => {
      const mockTag = { id: 1, name: "Bills" };
      const stmt = createMockStatement({ get: vi.fn().mockReturnValue(mockTag) });
      mockDb.prepare.mockReturnValue(stmt);

      const result = repository.getByName("bills");

      expect(result).toEqual(mockTag);
      expect(stmt.get).toHaveBeenCalledWith("BILLS");
    });

    it("should trim whitespace from name", () => {
      const mockTag = { id: 1, name: "Shopping" };
      const stmt = createMockStatement({ get: vi.fn().mockReturnValue(mockTag) });
      mockDb.prepare.mockReturnValue(stmt);

      repository.getByName("  Shopping  ");

      expect(stmt.get).toHaveBeenCalledWith("SHOPPING");
    });

    it("should return null when tag not found", () => {
      const stmt = createMockStatement({ get: vi.fn().mockReturnValue(undefined) });
      mockDb.prepare.mockReturnValue(stmt);

      const result = repository.getByName("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("create", () => {
    it("should return existing tag id if name already exists", () => {
      const stmt = createMockStatement({ get: vi.fn().mockReturnValue({ id: 5 }) });
      mockDb.prepare.mockReturnValue(stmt);

      const result = repository.create("Existing Tag");

      expect(result).toBe(5);
    });

    it("should create new tag and return id", () => {
      const checkStmt = createMockStatement({ get: vi.fn().mockReturnValue(undefined) });
      const insertStmt = createMockStatement({
        run: vi.fn().mockReturnValue({ lastInsertRowid: 10, changes: 1 }),
      });

      let callCount = 0;
      mockDb.prepare.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? checkStmt : insertStmt;
      });

      const result = repository.create("New Tag");

      expect(result).toBe(10);
      expect(insertStmt.run).toHaveBeenCalled();
    });

    it("should use canonical name (uppercase, trimmed) for lookup", () => {
      const stmt = createMockStatement({ get: vi.fn().mockReturnValue({ id: 1 }) });
      mockDb.prepare.mockReturnValue(stmt);

      repository.create("  my tag  ");

      expect(stmt.get).toHaveBeenCalledWith("MY TAG");
    });
  });

  describe("addToLineItem", () => {
    it("should return false if tag already on line item", () => {
      const stmt = createMockStatement({ get: vi.fn().mockReturnValue({ 1: 1 }) });
      mockDb.prepare.mockReturnValue(stmt);

      const result = repository.addToLineItem(1, 2);

      expect(result).toBe(false);
    });

    it("should add tag to line item and return true", () => {
      const checkStmt = createMockStatement({ get: vi.fn().mockReturnValue(undefined) });
      const insertStmt = createMockStatement({ run: vi.fn() });

      let callCount = 0;
      mockDb.prepare.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? checkStmt : insertStmt;
      });

      const result = repository.addToLineItem(1, 2);

      expect(result).toBe(true);
      expect(insertStmt.run).toHaveBeenCalledWith(1, 2);
    });
  });

  describe("removeFromLineItem", () => {
    it("should return true when tag removed", () => {
      const stmt = createMockStatement({
        run: vi.fn().mockReturnValue({ changes: 1 }),
      });
      mockDb.prepare.mockReturnValue(stmt);

      const result = repository.removeFromLineItem(1, 2);

      expect(result).toBe(true);
      expect(stmt.run).toHaveBeenCalledWith(1, 2);
    });

    it("should return false when tag not found on line item", () => {
      const stmt = createMockStatement({
        run: vi.fn().mockReturnValue({ changes: 0 }),
      });
      mockDb.prepare.mockReturnValue(stmt);

      const result = repository.removeFromLineItem(1, 2);

      expect(result).toBe(false);
    });
  });

  describe("tagTransaction", () => {
    it("should add tag to all line items in transaction", () => {
      const lineItems = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const listStmt = createMockStatement({ all: vi.fn().mockReturnValue(lineItems) });
      const checkStmt = createMockStatement({ get: vi.fn().mockReturnValue(undefined) });
      const insertStmt = createMockStatement({ run: vi.fn() });

      let callIndex = 0;
      mockDb.prepare.mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) return listStmt;
        if (callIndex % 2 === 0) return checkStmt;
        return insertStmt;
      });

      const result = repository.tagTransaction(100, 5);

      expect(result).toBe(3);
    });

    it("should return 0 when transaction has no line items", () => {
      const stmt = createMockStatement({ all: vi.fn().mockReturnValue([]) });
      mockDb.prepare.mockReturnValue(stmt);

      const result = repository.tagTransaction(100, 5);

      expect(result).toBe(0);
    });
  });

  describe("untagTransaction", () => {
    it("should remove tag from all line items in transaction", () => {
      const lineItems = [{ id: 1 }, { id: 2 }];
      const listStmt = createMockStatement({ all: vi.fn().mockReturnValue(lineItems) });
      const deleteStmt = createMockStatement({
        run: vi.fn().mockReturnValue({ changes: 1 }),
      });

      let callIndex = 0;
      mockDb.prepare.mockImplementation(() => {
        callIndex++;
        return callIndex === 1 ? listStmt : deleteStmt;
      });

      const result = repository.untagTransaction(100, 5);

      expect(result).toBe(2);
    });
  });
});
