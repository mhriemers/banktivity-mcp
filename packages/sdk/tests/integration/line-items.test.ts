import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createTestDatabase, seedTestDatabase, createMockConnection, type TestData } from "./test-db.js";
import { TransactionRepository } from "../../src/repositories/transactions.js";
import { LineItemRepository } from "../../src/repositories/line-items.js";

describe("Line Item Integration Tests", () => {
  let db: Database.Database;
  let testData: TestData;
  let transactionRepo: TransactionRepository;
  let lineItemRepo: LineItemRepository;

  beforeEach(() => {
    db = createTestDatabase();
    testData = seedTestDatabase(db);
    const connection = createMockConnection(db);
    lineItemRepo = new LineItemRepository(db);
    transactionRepo = new TransactionRepository(connection as any, lineItemRepo);
  });

  afterEach(() => {
    db.close();
  });

  describe("get line item", () => {
    it("should get line item by id", () => {
      const { lineItemIds } = transactionRepo.create({
        title: "Test",
        date: "2024-01-15",
        lineItems: [
          { accountId: testData.accounts.checking, amount: -50.00, memo: "Test memo" },
        ],
      });

      const lineItem = lineItemRepo.get(lineItemIds[0]);

      expect(lineItem).not.toBeNull();
      expect(lineItem!.accountId).toBe(testData.accounts.checking);
      expect(lineItem!.accountName).toBe("Checking");
      expect(lineItem!.amount).toBe(-50.00);
      expect(lineItem!.memo).toBe("Test memo");
    });

    it("should return null for non-existent line item", () => {
      const lineItem = lineItemRepo.get(999);
      expect(lineItem).toBeNull();
    });
  });

  describe("get line items for transaction", () => {
    it("should get all line items for a transaction", () => {
      const { transactionId } = transactionRepo.create({
        title: "Split Transaction",
        date: "2024-01-15",
        lineItems: [
          { accountId: testData.accounts.checking, amount: -100.00 },
          { accountId: testData.accounts.groceries, amount: 60.00 },
          { accountId: testData.accounts.groceries, amount: 40.00 },
        ],
      });

      const lineItems = lineItemRepo.getForTransaction(transactionId);

      expect(lineItems).toHaveLength(3);
      expect(lineItems.reduce((sum, li) => sum + li.amount, 0)).toBe(0);
    });

    it("should return empty array for non-existent transaction", () => {
      const lineItems = lineItemRepo.getForTransaction(999);
      expect(lineItems).toEqual([]);
    });
  });

  describe("update line item", () => {
    it("should update line item amount", () => {
      const { lineItemIds } = transactionRepo.create({
        title: "Test",
        date: "2024-01-15",
        lineItems: [
          { accountId: testData.accounts.checking, amount: -50.00 },
        ],
      });

      const affectedAccounts = lineItemRepo.update(lineItemIds[0], { amount: -75.00 });

      expect(affectedAccounts).not.toBeNull();
      expect(affectedAccounts!.has(testData.accounts.checking)).toBe(true);

      const updated = lineItemRepo.get(lineItemIds[0]);
      expect(updated!.amount).toBe(-75.00);
    });

    it("should update line item memo", () => {
      const { lineItemIds } = transactionRepo.create({
        title: "Test",
        date: "2024-01-15",
        lineItems: [
          { accountId: testData.accounts.checking, amount: -50.00 },
        ],
      });

      lineItemRepo.update(lineItemIds[0], { memo: "Updated memo" });

      const updated = lineItemRepo.get(lineItemIds[0]);
      expect(updated!.memo).toBe("Updated memo");
    });

    it("should update line item account and track both affected accounts", () => {
      const { lineItemIds } = transactionRepo.create({
        title: "Test",
        date: "2024-01-15",
        lineItems: [
          { accountId: testData.accounts.checking, amount: -50.00 },
        ],
      });

      const affectedAccounts = lineItemRepo.update(lineItemIds[0], {
        accountId: testData.accounts.savings,
      });

      expect(affectedAccounts).not.toBeNull();
      expect(affectedAccounts!.has(testData.accounts.checking)).toBe(true);
      expect(affectedAccounts!.has(testData.accounts.savings)).toBe(true);

      const updated = lineItemRepo.get(lineItemIds[0]);
      expect(updated!.accountId).toBe(testData.accounts.savings);
      expect(updated!.accountName).toBe("Savings");
    });

    it("should return null for non-existent line item", () => {
      const result = lineItemRepo.update(999, { amount: 100 });
      expect(result).toBeNull();
    });
  });

  describe("delete line item", () => {
    it("should delete line item and return account info", () => {
      const { transactionId, lineItemIds } = transactionRepo.create({
        title: "Test",
        date: "2024-01-15",
        lineItems: [
          { accountId: testData.accounts.checking, amount: -50.00 },
          { accountId: testData.accounts.groceries, amount: 50.00 },
        ],
      });

      const result = lineItemRepo.delete(lineItemIds[0]);

      expect(result).not.toBeNull();
      expect(result!.accountId).toBe(testData.accounts.checking);
      expect(result!.transactionId).toBe(transactionId);

      expect(lineItemRepo.get(lineItemIds[0])).toBeNull();
      expect(lineItemRepo.get(lineItemIds[1])).not.toBeNull();
    });

    it("should return null for non-existent line item", () => {
      const result = lineItemRepo.delete(999);
      expect(result).toBeNull();
    });
  });

  describe("running balance recalculation", () => {
    it("should calculate running balances in date order", () => {
      // Create transactions in non-chronological order
      transactionRepo.create({
        title: "Third",
        date: "2024-01-03",
        lineItems: [{ accountId: testData.accounts.checking, amount: 30.00 }],
      });

      transactionRepo.create({
        title: "First",
        date: "2024-01-01",
        lineItems: [{ accountId: testData.accounts.checking, amount: 100.00 }],
      });

      transactionRepo.create({
        title: "Second",
        date: "2024-01-02",
        lineItems: [{ accountId: testData.accounts.checking, amount: -20.00 }],
      });

      // Get transactions (ordered by date DESC)
      const transactions = transactionRepo.list({ accountId: testData.accounts.checking });

      // Third (2024-01-03): 100 - 20 + 30 = 110
      expect(transactions[0].lineItems[0].runningBalance).toBe(110.00);

      // Second (2024-01-02): 100 - 20 = 80
      expect(transactions[1].lineItems[0].runningBalance).toBe(80.00);

      // First (2024-01-01): 100
      expect(transactions[2].lineItems[0].runningBalance).toBe(100.00);
    });

    it("should handle multiple accounts independently", () => {
      transactionRepo.create({
        title: "Deposit to Checking",
        date: "2024-01-01",
        lineItems: [
          { accountId: testData.accounts.checking, amount: 1000.00 },
          { accountId: testData.accounts.salary, amount: -1000.00 },
        ],
      });

      transactionRepo.create({
        title: "Transfer to Savings",
        date: "2024-01-02",
        lineItems: [
          { accountId: testData.accounts.checking, amount: -500.00 },
          { accountId: testData.accounts.savings, amount: 500.00 },
        ],
      });

      const checkingTx = transactionRepo.list({ accountId: testData.accounts.checking });
      const savingsTx = transactionRepo.list({ accountId: testData.accounts.savings });

      // Checking: 1000 - 500 = 500 (latest balance)
      expect(checkingTx[0].lineItems[0].runningBalance).toBe(500.00);

      // Savings: 500 (only one transaction)
      expect(savingsTx[0].lineItems[0].runningBalance).toBe(500.00);
    });
  });

  describe("get account IDs for transaction", () => {
    it("should return unique account IDs", () => {
      const { transactionId } = transactionRepo.create({
        title: "Split",
        date: "2024-01-15",
        lineItems: [
          { accountId: testData.accounts.checking, amount: -100.00 },
          { accountId: testData.accounts.groceries, amount: 50.00 },
          { accountId: testData.accounts.groceries, amount: 50.00 },
        ],
      });

      const accountIds = lineItemRepo.getAccountIdsForTransaction(transactionId);

      expect(accountIds).toHaveLength(2);
      expect(accountIds).toContain(testData.accounts.checking);
      expect(accountIds).toContain(testData.accounts.groceries);
    });
  });
});
