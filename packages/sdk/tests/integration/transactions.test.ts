import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createTestDatabase, seedTestDatabase, createMockConnection, type TestData } from "./test-db.js";
import { TransactionRepository } from "../../src/repositories/transactions.js";
import { LineItemRepository } from "../../src/repositories/line-items.js";
import { TagRepository } from "../../src/repositories/tags.js";

describe("Transaction Integration Tests", () => {
  let db: Database.Database;
  let testData: TestData;
  let transactionRepo: TransactionRepository;
  let lineItemRepo: LineItemRepository;
  let tagRepo: TagRepository;

  beforeEach(() => {
    db = createTestDatabase();
    testData = seedTestDatabase(db);
    const connection = createMockConnection(db);
    lineItemRepo = new LineItemRepository(db);
    transactionRepo = new TransactionRepository(connection as any, lineItemRepo);
    tagRepo = new TagRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("create transaction with line items", () => {
    it("should create a transaction with multiple line items", () => {
      const result = transactionRepo.create({
        title: "Grocery Shopping",
        date: "2024-01-15",
        note: "Weekly groceries",
        lineItems: [
          { accountId: testData.accounts.checking, amount: -50.00 },
          { accountId: testData.accounts.groceries, amount: 50.00 },
        ],
      });

      expect(result.transactionId).toBeGreaterThan(0);
      expect(result.lineItemIds).toHaveLength(2);

      // Verify transaction was created
      const transaction = transactionRepo.get(result.transactionId);
      expect(transaction).not.toBeNull();
      expect(transaction!.title).toBe("Grocery Shopping");
      expect(transaction!.note).toBe("Weekly groceries");
      expect(transaction!.date).toBe("2024-01-15");
      expect(transaction!.lineItems).toHaveLength(2);

      // Verify line items
      expect(transaction!.lineItems[0].amount).toBe(-50.00);
      expect(transaction!.lineItems[0].accountName).toBe("Checking");
      expect(transaction!.lineItems[1].amount).toBe(50.00);
      expect(transaction!.lineItems[1].accountName).toBe("Groceries");
    });

    it("should update running balances after creating transaction", () => {
      // Create first transaction
      transactionRepo.create({
        title: "Initial Deposit",
        date: "2024-01-01",
        lineItems: [
          { accountId: testData.accounts.checking, amount: 1000.00 },
          { accountId: testData.accounts.salary, amount: -1000.00 },
        ],
      });

      // Create second transaction
      transactionRepo.create({
        title: "Purchase",
        date: "2024-01-02",
        lineItems: [
          { accountId: testData.accounts.checking, amount: -100.00 },
          { accountId: testData.accounts.groceries, amount: 100.00 },
        ],
      });

      // Check running balances
      const transactions = transactionRepo.list({ accountId: testData.accounts.checking });
      expect(transactions).toHaveLength(2);

      // Most recent first (ordered by date DESC)
      const purchase = transactions[0];
      const deposit = transactions[1];

      expect(purchase.lineItems[0].runningBalance).toBe(900.00);
      expect(deposit.lineItems[0].runningBalance).toBe(1000.00);
    });

    it("should create transaction with transaction type", () => {
      const result = transactionRepo.create({
        title: "Salary",
        date: "2024-01-15",
        transactionType: "Deposit",
        lineItems: [
          { accountId: testData.accounts.checking, amount: 3000.00 },
          { accountId: testData.accounts.salary, amount: -3000.00 },
        ],
      });

      const transaction = transactionRepo.get(result.transactionId);
      expect(transaction!.transactionType).toBe("Deposit");
    });
  });

  describe("update transaction", () => {
    it("should update transaction title and note", () => {
      const { transactionId } = transactionRepo.create({
        title: "Original Title",
        date: "2024-01-15",
        lineItems: [
          { accountId: testData.accounts.checking, amount: -25.00 },
          { accountId: testData.accounts.groceries, amount: 25.00 },
        ],
      });

      const updated = transactionRepo.update(transactionId, {
        title: "Updated Title",
        note: "Added note",
      });

      expect(updated).toBe(true);

      const transaction = transactionRepo.get(transactionId);
      expect(transaction!.title).toBe("Updated Title");
      expect(transaction!.note).toBe("Added note");
    });

    it("should update transaction date and recalculate balances", () => {
      // Create two transactions
      const first = transactionRepo.create({
        title: "First",
        date: "2024-01-01",
        lineItems: [
          { accountId: testData.accounts.checking, amount: 100.00 },
        ],
      });

      transactionRepo.create({
        title: "Second",
        date: "2024-01-03",
        lineItems: [
          { accountId: testData.accounts.checking, amount: 50.00 },
        ],
      });

      // Move first transaction to after second
      transactionRepo.update(first.transactionId, { date: "2024-01-05" });

      // Check running balances are recalculated
      const transactions = transactionRepo.list({ accountId: testData.accounts.checking });

      // Now "First" should be first (most recent) with date 2024-01-05
      expect(transactions[0].title).toBe("First");
      expect(transactions[0].lineItems[0].runningBalance).toBe(150.00);
      expect(transactions[1].title).toBe("Second");
      expect(transactions[1].lineItems[0].runningBalance).toBe(50.00);
    });

    it("should mark transaction as cleared", () => {
      const { transactionId } = transactionRepo.create({
        title: "Test",
        date: "2024-01-15",
        lineItems: [{ accountId: testData.accounts.checking, amount: 100.00 }],
      });

      expect(transactionRepo.get(transactionId)!.cleared).toBe(false);

      transactionRepo.update(transactionId, { cleared: true });

      expect(transactionRepo.get(transactionId)!.cleared).toBe(true);
    });
  });

  describe("delete transaction", () => {
    it("should delete transaction and its line items", () => {
      const { transactionId, lineItemIds } = transactionRepo.create({
        title: "To Delete",
        date: "2024-01-15",
        lineItems: [
          { accountId: testData.accounts.checking, amount: -50.00 },
          { accountId: testData.accounts.groceries, amount: 50.00 },
        ],
      });

      transactionRepo.delete(transactionId);

      expect(transactionRepo.get(transactionId)).toBeNull();
      expect(lineItemRepo.get(lineItemIds[0])).toBeNull();
      expect(lineItemRepo.get(lineItemIds[1])).toBeNull();
    });

    it("should recalculate running balances after deletion", () => {
      // Create three transactions
      transactionRepo.create({
        title: "First",
        date: "2024-01-01",
        lineItems: [{ accountId: testData.accounts.checking, amount: 100.00 }],
      });

      const second = transactionRepo.create({
        title: "Second",
        date: "2024-01-02",
        lineItems: [{ accountId: testData.accounts.checking, amount: 50.00 }],
      });

      transactionRepo.create({
        title: "Third",
        date: "2024-01-03",
        lineItems: [{ accountId: testData.accounts.checking, amount: 25.00 }],
      });

      // Delete middle transaction
      transactionRepo.delete(second.transactionId);

      // Verify balances
      const transactions = transactionRepo.list({ accountId: testData.accounts.checking });
      expect(transactions).toHaveLength(2);

      // Third (most recent)
      expect(transactions[0].title).toBe("Third");
      expect(transactions[0].lineItems[0].runningBalance).toBe(125.00);

      // First
      expect(transactions[1].title).toBe("First");
      expect(transactions[1].lineItems[0].runningBalance).toBe(100.00);
    });
  });

  describe("list and filter transactions", () => {
    beforeEach(() => {
      // Create test transactions
      transactionRepo.create({
        title: "January Purchase",
        date: "2024-01-15",
        lineItems: [
          { accountId: testData.accounts.checking, amount: -100.00 },
          { accountId: testData.accounts.groceries, amount: 100.00 },
        ],
      });

      transactionRepo.create({
        title: "February Purchase",
        date: "2024-02-15",
        lineItems: [
          { accountId: testData.accounts.checking, amount: -200.00 },
          { accountId: testData.accounts.groceries, amount: 200.00 },
        ],
      });

      transactionRepo.create({
        title: "March Salary",
        date: "2024-03-01",
        lineItems: [
          { accountId: testData.accounts.savings, amount: 5000.00 },
          { accountId: testData.accounts.salary, amount: -5000.00 },
        ],
      });
    });

    it("should list all transactions", () => {
      const transactions = transactionRepo.list();
      expect(transactions).toHaveLength(3);
    });

    it("should filter by account", () => {
      const checkingTransactions = transactionRepo.list({
        accountId: testData.accounts.checking,
      });
      expect(checkingTransactions).toHaveLength(2);

      const savingsTransactions = transactionRepo.list({
        accountId: testData.accounts.savings,
      });
      expect(savingsTransactions).toHaveLength(1);
    });

    it("should filter by date range", () => {
      const transactions = transactionRepo.list({
        startDate: "2024-02-01",
        endDate: "2024-02-28",
      });
      expect(transactions).toHaveLength(1);
      expect(transactions[0].title).toBe("February Purchase");
    });

    it("should support pagination with limit and offset", () => {
      const firstPage = transactionRepo.list({ limit: 2 });
      expect(firstPage).toHaveLength(2);

      const secondPage = transactionRepo.list({ limit: 2, offset: 2 });
      expect(secondPage).toHaveLength(1);
    });

    it("should return transactions ordered by date descending", () => {
      const transactions = transactionRepo.list();
      expect(transactions[0].date).toBe("2024-03-01");
      expect(transactions[1].date).toBe("2024-02-15");
      expect(transactions[2].date).toBe("2024-01-15");
    });
  });

  describe("search transactions", () => {
    beforeEach(() => {
      transactionRepo.create({
        title: "Coffee at Starbucks",
        date: "2024-01-15",
        note: "Morning coffee",
        lineItems: [{ accountId: testData.accounts.checking, amount: -5.00 }],
      });

      transactionRepo.create({
        title: "Groceries at Walmart",
        date: "2024-01-16",
        lineItems: [{ accountId: testData.accounts.checking, amount: -150.00 }],
      });

      transactionRepo.create({
        title: "Amazon Purchase",
        date: "2024-01-17",
        note: "Coffee maker",
        lineItems: [{ accountId: testData.accounts.checking, amount: -75.00 }],
      });
    });

    it("should search by title", () => {
      const results = transactionRepo.search("Starbucks");
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Coffee at Starbucks");
    });

    it("should search by note", () => {
      const results = transactionRepo.search("maker");
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Amazon Purchase");
    });

    it("should be case insensitive", () => {
      const results = transactionRepo.search("STARBUCKS");
      expect(results).toHaveLength(1);
    });

    it("should respect limit", () => {
      // Search for anything
      const results = transactionRepo.search("a", 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe("reconcile transactions", () => {
    it("should mark multiple transactions as cleared", () => {
      const tx1 = transactionRepo.create({
        title: "Transaction 1",
        date: "2024-01-15",
        lineItems: [{ accountId: testData.accounts.checking, amount: 100.00 }],
      });

      const tx2 = transactionRepo.create({
        title: "Transaction 2",
        date: "2024-01-16",
        lineItems: [{ accountId: testData.accounts.checking, amount: 200.00 }],
      });

      const count = transactionRepo.reconcile([tx1.transactionId, tx2.transactionId]);
      expect(count).toBe(2);

      expect(transactionRepo.get(tx1.transactionId)!.cleared).toBe(true);
      expect(transactionRepo.get(tx2.transactionId)!.cleared).toBe(true);
    });

    it("should unmark transactions as cleared", () => {
      const { transactionId } = transactionRepo.create({
        title: "Test",
        date: "2024-01-15",
        lineItems: [{ accountId: testData.accounts.checking, amount: 100.00 }],
      });

      transactionRepo.reconcile([transactionId], true);
      expect(transactionRepo.get(transactionId)!.cleared).toBe(true);

      transactionRepo.reconcile([transactionId], false);
      expect(transactionRepo.get(transactionId)!.cleared).toBe(false);
    });
  });

  describe("transaction count", () => {
    it("should return correct count", () => {
      expect(transactionRepo.count()).toBe(0);

      transactionRepo.create({
        title: "Test 1",
        date: "2024-01-15",
        lineItems: [{ accountId: testData.accounts.checking, amount: 100.00 }],
      });

      expect(transactionRepo.count()).toBe(1);

      transactionRepo.create({
        title: "Test 2",
        date: "2024-01-16",
        lineItems: [{ accountId: testData.accounts.checking, amount: 200.00 }],
      });

      expect(transactionRepo.count()).toBe(2);
    });
  });

  describe("tagging transactions", () => {
    it("should tag all line items in a transaction", () => {
      const { transactionId } = transactionRepo.create({
        title: "Shopping",
        date: "2024-01-15",
        lineItems: [
          { accountId: testData.accounts.checking, amount: -50.00 },
          { accountId: testData.accounts.groceries, amount: 50.00 },
        ],
      });

      const tagId = tagRepo.create("Weekly Shopping");
      const tagged = tagRepo.tagTransaction(transactionId, tagId);

      expect(tagged).toBe(2);
    });

    it("should untag all line items in a transaction", () => {
      const { transactionId } = transactionRepo.create({
        title: "Shopping",
        date: "2024-01-15",
        lineItems: [
          { accountId: testData.accounts.checking, amount: -50.00 },
          { accountId: testData.accounts.groceries, amount: 50.00 },
        ],
      });

      const tagId = tagRepo.create("To Remove");
      tagRepo.tagTransaction(transactionId, tagId);

      const untagged = tagRepo.untagTransaction(transactionId, tagId);
      expect(untagged).toBe(2);
    });
  });
});
