import { describe, it, expect, vi, beforeEach } from "vitest";
import { BaseRepository } from "../../src/repositories/base.js";
import { createMockDatabase, createMockStatement, asDatabaseInstance } from "../helpers/mock-db.js";

// Create a concrete implementation for testing
class TestRepository extends BaseRepository {
  public testUpdate(
    table: string,
    id: number,
    updates: object,
    columnMap: Record<string, string>,
    options?: Parameters<BaseRepository["executeUpdate"]>[4]
  ) {
    return this.executeUpdate(table, id, updates, columnMap, options);
  }

  public testDelete(
    table: string,
    id: number,
    options?: Parameters<BaseRepository["executeDelete"]>[2]
  ) {
    return this.executeDelete(table, id, options);
  }

  public testTransaction<T>(fn: () => T) {
    return this.runTransaction(fn);
  }
}

describe("BaseRepository", () => {
  let mockDb: ReturnType<typeof createMockDatabase>;
  let repository: TestRepository;

  beforeEach(() => {
    mockDb = createMockDatabase();
    repository = new TestRepository(asDatabaseInstance(mockDb));
  });

  describe("executeUpdate", () => {
    const columnMap = { name: "ZNAME", amount: "ZAMOUNT" };

    it("should return 0 when no updates provided", () => {
      const result = repository.testUpdate("ZTABLE", 1, {}, columnMap);
      expect(result).toBe(0);
      expect(mockDb.prepare).not.toHaveBeenCalled();
    });

    it("should execute update with correct SQL", () => {
      const stmt = createMockStatement({
        run: vi.fn().mockReturnValue({ changes: 1 }),
      });
      mockDb.prepare.mockReturnValue(stmt);

      const result = repository.testUpdate("ZTABLE", 1, { name: "Test" }, columnMap);

      expect(result).toBe(1);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE ZTABLE SET")
      );
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("ZNAME = ?")
      );
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("WHERE Z_PK = ?")
      );
    });

    it("should add modification date by default", () => {
      const stmt = createMockStatement({
        run: vi.fn().mockReturnValue({ changes: 1 }),
      });
      mockDb.prepare.mockReturnValue(stmt);

      repository.testUpdate("ZTABLE", 1, { name: "Test" }, columnMap);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("ZPMODIFICATIONDATE = ?")
      );
    });

    it("should skip modification date when disabled", () => {
      const stmt = createMockStatement({
        run: vi.fn().mockReturnValue({ changes: 1 }),
      });
      mockDb.prepare.mockReturnValue(stmt);

      repository.testUpdate("ZTABLE", 1, { name: "Test" }, columnMap, {
        addModificationDate: false,
      });

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.not.stringContaining("ZPMODIFICATIONDATE")
      );
    });

    it("should increment Z_OPT by default", () => {
      const stmt = createMockStatement({
        run: vi.fn().mockReturnValue({ changes: 1 }),
      });
      mockDb.prepare.mockReturnValue(stmt);

      repository.testUpdate("ZTABLE", 1, { name: "Test" }, columnMap);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("Z_OPT = Z_OPT + 1")
      );
    });

    it("should skip Z_OPT increment when disabled", () => {
      const stmt = createMockStatement({
        run: vi.fn().mockReturnValue({ changes: 1 }),
      });
      mockDb.prepare.mockReturnValue(stmt);

      repository.testUpdate("ZTABLE", 1, { name: "Test" }, columnMap, {
        incrementOpt: false,
      });

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.not.stringContaining("Z_OPT")
      );
    });

    it("should use custom id column when specified", () => {
      const stmt = createMockStatement({
        run: vi.fn().mockReturnValue({ changes: 1 }),
      });
      mockDb.prepare.mockReturnValue(stmt);

      repository.testUpdate("ZTABLE", 1, { name: "Test" }, columnMap, {
        idColumn: "ZCUSTOMID",
      });

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("WHERE ZCUSTOMID = ?")
      );
    });

    it("should add additional where clause when specified", () => {
      const stmt = createMockStatement({
        run: vi.fn().mockReturnValue({ changes: 1 }),
      });
      mockDb.prepare.mockReturnValue(stmt);

      repository.testUpdate("ZTABLE", 1, { name: "Test" }, columnMap, {
        additionalWhere: "ZDELETED = 0",
      });

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("AND ZDELETED = 0")
      );
    });
  });

  describe("executeDelete", () => {
    it("should return true when row deleted", () => {
      const stmt = createMockStatement({
        run: vi.fn().mockReturnValue({ changes: 1 }),
      });
      mockDb.prepare.mockReturnValue(stmt);

      const result = repository.testDelete("ZTABLE", 1);

      expect(result).toBe(true);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        "DELETE FROM ZTABLE WHERE Z_PK = ?"
      );
    });

    it("should return false when no row deleted", () => {
      const stmt = createMockStatement({
        run: vi.fn().mockReturnValue({ changes: 0 }),
      });
      mockDb.prepare.mockReturnValue(stmt);

      const result = repository.testDelete("ZTABLE", 999);

      expect(result).toBe(false);
    });

    it("should use custom id column when specified", () => {
      const stmt = createMockStatement({
        run: vi.fn().mockReturnValue({ changes: 1 }),
      });
      mockDb.prepare.mockReturnValue(stmt);

      repository.testDelete("ZTABLE", 1, { idColumn: "ZCUSTOMID" });

      expect(mockDb.prepare).toHaveBeenCalledWith(
        "DELETE FROM ZTABLE WHERE ZCUSTOMID = ?"
      );
    });

    it("should add additional where clause when specified", () => {
      const stmt = createMockStatement({
        run: vi.fn().mockReturnValue({ changes: 1 }),
      });
      mockDb.prepare.mockReturnValue(stmt);

      repository.testDelete("ZTABLE", 1, { additionalWhere: "ZACTIVE = 1" });

      expect(mockDb.prepare).toHaveBeenCalledWith(
        "DELETE FROM ZTABLE WHERE Z_PK = ? AND ZACTIVE = 1"
      );
    });
  });

  describe("runTransaction", () => {
    it("should wrap function in transaction", () => {
      const fn = vi.fn().mockReturnValue("result");
      // db.transaction returns a function that executes the wrapped function
      mockDb.transaction.mockImplementation((wrappedFn) => {
        return () => wrappedFn();
      });

      const result = repository.testTransaction(fn);

      expect(result).toBe("result");
      expect(mockDb.transaction).toHaveBeenCalledWith(fn);
      expect(fn).toHaveBeenCalled();
    });
  });
});
