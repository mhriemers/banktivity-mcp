import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createTestDatabase, seedTestDatabase, createMockConnection, type TestData } from "./test-db.js";
import { AccountRepository } from "../../src/repositories/accounts.js";
import { TransactionRepository } from "../../src/repositories/transactions.js";
import { LineItemRepository } from "../../src/repositories/line-items.js";
import { ACCOUNT_CLASS } from "../../src/constants.js";

describe("Account Integration Tests", () => {
  let db: Database.Database;
  let testData: TestData;
  let accountRepo: AccountRepository;
  let transactionRepo: TransactionRepository;
  let lineItemRepo: LineItemRepository;

  beforeEach(() => {
    db = createTestDatabase();
    testData = seedTestDatabase(db);
    const connection = createMockConnection(db);
    accountRepo = new AccountRepository(connection as any);
    lineItemRepo = new LineItemRepository(db);
    transactionRepo = new TransactionRepository(connection as any, lineItemRepo);
  });

  afterEach(() => {
    db.close();
  });

  describe("list accounts", () => {
    it("should list all visible accounts", () => {
      const accounts = accountRepo.list();

      expect(accounts.length).toBeGreaterThanOrEqual(4);
      expect(accounts.find((a) => a.name === "Checking")).toBeDefined();
      expect(accounts.find((a) => a.name === "Savings")).toBeDefined();
    });

    it("should exclude hidden accounts by default", () => {
      // Create hidden account
      accountRepo.create({
        name: "Hidden Account",
        accountClass: ACCOUNT_CLASS.CHECKING,
        hidden: true,
      });

      const accounts = accountRepo.list();
      expect(accounts.find((a) => a.name === "Hidden Account")).toBeUndefined();
    });

    it("should include hidden accounts when requested", () => {
      accountRepo.create({
        name: "Hidden Account",
        accountClass: ACCOUNT_CLASS.CHECKING,
        hidden: true,
      });

      const accounts = accountRepo.list({ includeHidden: true });
      expect(accounts.find((a) => a.name === "Hidden Account")).toBeDefined();
    });

    it("should include account type name", () => {
      const accounts = accountRepo.list();
      const checking = accounts.find((a) => a.name === "Checking");

      expect(checking?.accountType).toBe("Checking");
    });

    it("should include currency code", () => {
      const accounts = accountRepo.list();
      const checking = accounts.find((a) => a.name === "Checking");

      expect(checking?.currency).toBe("EUR");
    });
  });

  describe("get account", () => {
    it("should get account by id", () => {
      const account = accountRepo.get(testData.accounts.checking);

      expect(account).not.toBeNull();
      expect(account!.name).toBe("Checking");
      expect(account!.accountClass).toBe(ACCOUNT_CLASS.CHECKING);
      expect(account!.accountType).toBe("Checking");
    });

    it("should return null for non-existent account", () => {
      const account = accountRepo.get(99999);
      expect(account).toBeNull();
    });
  });

  describe("find by name", () => {
    it("should find account by exact name", () => {
      const account = accountRepo.findByName("Checking");

      expect(account).not.toBeNull();
      expect(account!.name).toBe("Checking");
    });

    it("should find account by name case-insensitively", () => {
      const account = accountRepo.findByName("checking");

      expect(account).not.toBeNull();
      expect(account!.name).toBe("Checking");
    });

    it("should find account by full name", () => {
      const account = accountRepo.findByName("Expenses:Groceries");

      expect(account).not.toBeNull();
      expect(account!.name).toBe("Groceries");
    });

    it("should return null when not found", () => {
      const account = accountRepo.findByName("NonExistent");
      expect(account).toBeNull();
    });

    it("should find hidden accounts", () => {
      accountRepo.create({
        name: "Secret Account",
        accountClass: ACCOUNT_CLASS.SAVINGS,
        hidden: true,
      });

      const account = accountRepo.findByName("Secret Account");
      expect(account).not.toBeNull();
    });
  });

  describe("get balance", () => {
    it("should return 0 for account with no transactions", () => {
      const balance = accountRepo.getBalance(testData.accounts.checking);
      expect(balance).toBe(0);
    });

    it("should calculate correct balance from transactions", () => {
      transactionRepo.create({
        title: "Deposit",
        date: "2024-01-01",
        lineItems: [
          { accountId: testData.accounts.checking, amount: 1000 },
          { accountId: testData.accounts.salary, amount: -1000 },
        ],
      });

      transactionRepo.create({
        title: "Purchase",
        date: "2024-01-02",
        lineItems: [
          { accountId: testData.accounts.checking, amount: -250 },
          { accountId: testData.accounts.groceries, amount: 250 },
        ],
      });

      const balance = accountRepo.getBalance(testData.accounts.checking);
      expect(balance).toBe(750);
    });
  });

  describe("create account", () => {
    it("should create checking account", () => {
      const id = accountRepo.create({
        name: "New Checking",
        accountClass: ACCOUNT_CLASS.CHECKING,
      });

      const account = accountRepo.get(id);
      expect(account).not.toBeNull();
      expect(account!.name).toBe("New Checking");
      expect(account!.fullName).toBe("New Checking");
      expect(account!.accountClass).toBe(ACCOUNT_CLASS.CHECKING);
      expect(account!.hidden).toBe(false);
    });

    it("should create account with full name", () => {
      const id = accountRepo.create({
        name: "Groceries",
        fullName: "Expenses:Food:Groceries",
        accountClass: ACCOUNT_CLASS.EXPENSE,
      });

      const account = accountRepo.get(id);
      expect(account!.fullName).toBe("Expenses:Food:Groceries");
    });

    it("should create hidden account", () => {
      const id = accountRepo.create({
        name: "Hidden",
        accountClass: ACCOUNT_CLASS.SAVINGS,
        hidden: true,
      });

      const account = accountRepo.get(id);
      expect(account!.hidden).toBe(true);
    });

    it("should create credit card account", () => {
      const id = accountRepo.create({
        name: "Visa",
        accountClass: ACCOUNT_CLASS.CREDIT_CARD,
      });

      const account = accountRepo.get(id);
      expect(account!.accountType).toBe("Credit Card");
    });

    it("should create income category", () => {
      const id = accountRepo.create({
        name: "Bonus",
        accountClass: ACCOUNT_CLASS.INCOME,
      });

      const account = accountRepo.get(id);
      expect(account!.accountType).toBe("Income");
    });

    it("should create expense category", () => {
      const id = accountRepo.create({
        name: "Entertainment",
        accountClass: ACCOUNT_CLASS.EXPENSE,
      });

      const account = accountRepo.get(id);
      expect(account!.accountType).toBe("Expense");
    });
  });

  describe("category analysis", () => {
    beforeEach(() => {
      // Create some expense transactions
      transactionRepo.create({
        title: "Groceries 1",
        date: "2024-01-15",
        lineItems: [
          { accountId: testData.accounts.checking, amount: -100 },
          { accountId: testData.accounts.groceries, amount: 100 },
        ],
      });

      transactionRepo.create({
        title: "Groceries 2",
        date: "2024-01-20",
        lineItems: [
          { accountId: testData.accounts.checking, amount: -75 },
          { accountId: testData.accounts.groceries, amount: 75 },
        ],
      });

      transactionRepo.create({
        title: "Salary",
        date: "2024-01-01",
        lineItems: [
          { accountId: testData.accounts.checking, amount: 3000 },
          { accountId: testData.accounts.salary, amount: -3000 },
        ],
      });
    });

    it("should analyze expense categories", () => {
      const analysis = accountRepo.getCategoryAnalysis("expense");

      expect(analysis.length).toBeGreaterThan(0);
      const groceries = analysis.find((a) => a.category === "Groceries");
      expect(groceries).toBeDefined();
      expect(groceries!.total).toBe(175);
      expect(groceries!.transactionCount).toBe(2);
    });

    it("should analyze income categories", () => {
      const analysis = accountRepo.getCategoryAnalysis("income");

      const salary = analysis.find((a) => a.category === "Salary");
      expect(salary).toBeDefined();
      expect(salary!.total).toBe(-3000);
      expect(salary!.transactionCount).toBe(1);
    });

    it("should filter by date range", () => {
      const analysis = accountRepo.getCategoryAnalysis("expense", {
        startDate: "2024-01-18",
        endDate: "2024-01-31",
      });

      const groceries = analysis.find((a) => a.category === "Groceries");
      expect(groceries).toBeDefined();
      expect(groceries!.total).toBe(75);
      expect(groceries!.transactionCount).toBe(1);
    });
  });

  describe("net worth", () => {
    it("should return zero net worth with no transactions", () => {
      const netWorth = accountRepo.getNetWorth();

      expect(netWorth.assets).toBe(0);
      expect(netWorth.liabilities).toBe(0);
      expect(netWorth.netWorth).toBe(0);
    });

    it("should calculate assets from checking and savings", () => {
      transactionRepo.create({
        title: "Deposit",
        date: "2024-01-01",
        lineItems: [
          { accountId: testData.accounts.checking, amount: 5000 },
          { accountId: testData.accounts.salary, amount: -5000 },
        ],
      });

      transactionRepo.create({
        title: "Transfer to Savings",
        date: "2024-01-02",
        lineItems: [
          { accountId: testData.accounts.checking, amount: -2000 },
          { accountId: testData.accounts.savings, amount: 2000 },
        ],
      });

      const netWorth = accountRepo.getNetWorth();
      expect(netWorth.assets).toBe(5000);
      expect(netWorth.netWorth).toBe(5000);
    });

    it("should calculate liabilities from credit cards", () => {
      // Create a credit card account
      const creditCardId = accountRepo.create({
        name: "Visa",
        accountClass: ACCOUNT_CLASS.CREDIT_CARD,
      });

      transactionRepo.create({
        title: "Credit Card Purchase",
        date: "2024-01-01",
        lineItems: [
          { accountId: creditCardId, amount: -500 },
          { accountId: testData.accounts.groceries, amount: 500 },
        ],
      });

      const netWorth = accountRepo.getNetWorth();
      expect(netWorth.liabilities).toBe(-500);
      expect(netWorth.netWorth).toBe(-500);
    });

    it("should calculate net worth combining assets and liabilities", () => {
      const creditCardId = accountRepo.create({
        name: "Visa",
        accountClass: ACCOUNT_CLASS.CREDIT_CARD,
      });

      transactionRepo.create({
        title: "Salary",
        date: "2024-01-01",
        lineItems: [
          { accountId: testData.accounts.checking, amount: 10000 },
          { accountId: testData.accounts.salary, amount: -10000 },
        ],
      });

      transactionRepo.create({
        title: "Credit Card Debt",
        date: "2024-01-02",
        lineItems: [
          { accountId: creditCardId, amount: -3000 },
          { accountId: testData.accounts.groceries, amount: 3000 },
        ],
      });

      const netWorth = accountRepo.getNetWorth();
      expect(netWorth.assets).toBe(10000);
      expect(netWorth.liabilities).toBe(-3000);
      expect(netWorth.netWorth).toBe(7000);
    });
  });
});
