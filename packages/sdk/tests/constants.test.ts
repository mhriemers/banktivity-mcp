import { describe, it, expect } from "vitest";
import {
  Z_ENT,
  ACCOUNT_CLASS,
  ACCOUNT_CLASS_NAMES,
  getAccountTypeName,
} from "../src/constants.js";

describe("constants", () => {
  describe("Z_ENT", () => {
    it("should have correct entity type values", () => {
      expect(Z_ENT.ACCOUNT).toBe(1);
      expect(Z_ENT.TAG).toBe(47);
      expect(Z_ENT.TRANSACTION).toBe(53);
      expect(Z_ENT.LINEITEM).toBe(19);
    });
  });

  describe("ACCOUNT_CLASS", () => {
    it("should have correct account class values", () => {
      expect(ACCOUNT_CLASS.CHECKING).toBe(1006);
      expect(ACCOUNT_CLASS.SAVINGS).toBe(1002);
      expect(ACCOUNT_CLASS.CREDIT_CARD).toBe(5001);
      expect(ACCOUNT_CLASS.INCOME).toBe(6000);
      expect(ACCOUNT_CLASS.EXPENSE).toBe(7000);
    });
  });

  describe("getAccountTypeName", () => {
    it("should return correct name for known account classes", () => {
      expect(getAccountTypeName(ACCOUNT_CLASS.CHECKING)).toBe("Checking");
      expect(getAccountTypeName(ACCOUNT_CLASS.SAVINGS)).toBe("Savings/Investment");
      expect(getAccountTypeName(ACCOUNT_CLASS.CREDIT_CARD)).toBe("Credit Card");
      expect(getAccountTypeName(ACCOUNT_CLASS.INCOME)).toBe("Income");
      expect(getAccountTypeName(ACCOUNT_CLASS.EXPENSE)).toBe("Expense");
    });

    it("should return Unknown with code for unknown account classes", () => {
      expect(getAccountTypeName(9999)).toBe("Unknown (9999)");
      expect(getAccountTypeName(0)).toBe("Unknown (0)");
    });
  });
});
