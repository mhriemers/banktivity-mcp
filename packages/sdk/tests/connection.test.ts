import { describe, it, expect, vi, beforeEach } from "vitest";

// Track constructor calls and mock instance
let constructorCalls: Array<{ path: string; options: { readonly: boolean } }> = [];
const mockStatement = {
  get: vi.fn(),
};
const mockDbInstance = {
  prepare: vi.fn().mockReturnValue(mockStatement),
  close: vi.fn(),
};

vi.mock("better-sqlite3", () => {
  return {
    default: class MockDatabase {
      constructor(path: string, options: { readonly: boolean }) {
        constructorCalls.push({ path, options });
        return mockDbInstance;
      }
    },
  };
});

import { DatabaseConnection } from "../src/connection.js";

describe("DatabaseConnection", () => {
  let connection: DatabaseConnection;

  beforeEach(() => {
    constructorCalls = [];
    mockStatement.get.mockReset();
    mockDbInstance.close.mockReset();
    connection = new DatabaseConnection("/path/to/file.bank8");
  });

  describe("constructor", () => {
    it("should open database with correct path", () => {
      expect(constructorCalls[0]).toEqual({
        path: "/path/to/file.bank8/StoreContent/core.sql",
        options: { readonly: false },
      });
    });

    it("should open database in readonly mode when specified", () => {
      constructorCalls = [];
      new DatabaseConnection("/path/to/file.bank8", true);
      expect(constructorCalls[0]).toEqual({
        path: "/path/to/file.bank8/StoreContent/core.sql",
        options: { readonly: true },
      });
    });
  });

  describe("instance", () => {
    it("should return the database instance", () => {
      expect(connection.instance).toBeDefined();
    });
  });

  describe("close", () => {
    it("should close the database connection", () => {
      connection.close();
      expect(mockDbInstance.close).toHaveBeenCalled();
    });
  });

  describe("getDefaultCurrencyId", () => {
    it("should return currency id when found", () => {
      mockStatement.get.mockReturnValue({ id: 1 });

      const result = connection.getDefaultCurrencyId();

      expect(result).toBe(1);
    });

    it("should return null when no currency found", () => {
      mockStatement.get.mockReturnValue(undefined);

      const result = connection.getDefaultCurrencyId();

      expect(result).toBeNull();
    });
  });

  describe("getCurrencyIdByCode", () => {
    it("should return currency id for valid code", () => {
      mockStatement.get.mockReturnValue({ id: 2 });

      const result = connection.getCurrencyIdByCode("USD");

      expect(result).toBe(2);
      expect(mockStatement.get).toHaveBeenCalledWith("USD");
    });

    it("should return null for unknown code", () => {
      mockStatement.get.mockReturnValue(undefined);

      const result = connection.getCurrencyIdByCode("INVALID");

      expect(result).toBeNull();
    });
  });

  describe("getTransactionTypeId", () => {
    it("should return type id for valid name", () => {
      mockStatement.get.mockReturnValue({ id: 3 });

      const result = connection.getTransactionTypeId("Withdrawal");

      expect(result).toBe(3);
      expect(mockStatement.get).toHaveBeenCalledWith("Withdrawal", "Withdrawal");
    });

    it("should return null for unknown type", () => {
      mockStatement.get.mockReturnValue(undefined);

      const result = connection.getTransactionTypeId("Unknown");

      expect(result).toBeNull();
    });
  });
});
