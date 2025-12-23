import { describe, it, expect } from "vitest";
import { buildUpdateClauses, buildWhereConditions } from "../../src/utils/sql-builder.js";

describe("sql-builder utils", () => {
  describe("buildUpdateClauses", () => {
    const columnMap = {
      name: "ZNAME",
      amount: "ZAMOUNT",
      date: "ZDATE",
    };

    it("should return null when no updates provided", () => {
      const result = buildUpdateClauses({}, columnMap);
      expect(result).toBeNull();
    });

    it("should return null when all values are undefined", () => {
      const result = buildUpdateClauses(
        { name: undefined, amount: undefined },
        columnMap
      );
      expect(result).toBeNull();
    });

    it("should build single update clause", () => {
      const result = buildUpdateClauses({ name: "Test" }, columnMap);
      expect(result).toEqual({
        sql: "ZNAME = ?",
        params: ["Test"],
      });
    });

    it("should build multiple update clauses", () => {
      const result = buildUpdateClauses(
        { name: "Test", amount: 100 },
        columnMap
      );
      expect(result).toEqual({
        sql: "ZNAME = ?, ZAMOUNT = ?",
        params: ["Test", 100],
      });
    });

    it("should handle null values", () => {
      const result = buildUpdateClauses({ name: null }, columnMap);
      expect(result).toEqual({
        sql: "ZNAME = ?",
        params: [null],
      });
    });

    it("should ignore undefined values while including others", () => {
      const result = buildUpdateClauses(
        { name: "Test", amount: undefined, date: 12345 },
        columnMap
      );
      expect(result).toEqual({
        sql: "ZNAME = ?, ZDATE = ?",
        params: ["Test", 12345],
      });
    });

    it("should ignore fields not in column map", () => {
      const result = buildUpdateClauses(
        { name: "Test", unknownField: "ignored" },
        columnMap
      );
      expect(result).toEqual({
        sql: "ZNAME = ?",
        params: ["Test"],
      });
    });
  });

  describe("buildWhereConditions", () => {
    const columnMap = {
      accountId: "ZACCOUNT",
      type: "ZTYPE",
      status: "ZSTATUS",
    };

    it("should return empty conditions when no filters provided", () => {
      const result = buildWhereConditions({}, columnMap);
      expect(result).toEqual({
        conditions: [],
        params: [],
      });
    });

    it("should return empty conditions when all values are undefined", () => {
      const result = buildWhereConditions(
        { accountId: undefined, type: undefined },
        columnMap
      );
      expect(result).toEqual({
        conditions: [],
        params: [],
      });
    });

    it("should return empty conditions when all values are null", () => {
      const result = buildWhereConditions(
        { accountId: null, type: null },
        columnMap
      );
      expect(result).toEqual({
        conditions: [],
        params: [],
      });
    });

    it("should build single condition", () => {
      const result = buildWhereConditions({ accountId: "acc-123" }, columnMap);
      expect(result).toEqual({
        conditions: ["ZACCOUNT = ?"],
        params: ["acc-123"],
      });
    });

    it("should build multiple conditions", () => {
      const result = buildWhereConditions(
        { accountId: "acc-123", type: 1 },
        columnMap
      );
      expect(result).toEqual({
        conditions: ["ZACCOUNT = ?", "ZTYPE = ?"],
        params: ["acc-123", 1],
      });
    });

    it("should ignore undefined and null values", () => {
      const result = buildWhereConditions(
        { accountId: "acc-123", type: undefined, status: null },
        columnMap
      );
      expect(result).toEqual({
        conditions: ["ZACCOUNT = ?"],
        params: ["acc-123"],
      });
    });

    it("should ignore fields not in column map", () => {
      const result = buildWhereConditions(
        { accountId: "acc-123", unknownField: "ignored" },
        columnMap
      );
      expect(result).toEqual({
        conditions: ["ZACCOUNT = ?"],
        params: ["acc-123"],
      });
    });

    it("should handle numeric zero as valid filter", () => {
      const result = buildWhereConditions({ type: 0 }, columnMap);
      expect(result).toEqual({
        conditions: ["ZTYPE = ?"],
        params: [0],
      });
    });

    it("should handle empty string as valid filter", () => {
      const result = buildWhereConditions({ accountId: "" }, columnMap);
      expect(result).toEqual({
        conditions: ["ZACCOUNT = ?"],
        params: [""],
      });
    });
  });
});
