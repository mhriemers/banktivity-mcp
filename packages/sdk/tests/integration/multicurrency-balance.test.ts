import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createTestDatabase, seedTestDatabase, createMockConnection, type TestData } from "./test-db.js";
import { AccountRepository } from "../../src/repositories/accounts.js";
import { TransactionRepository } from "../../src/repositories/transactions.js";
import { LineItemRepository } from "../../src/repositories/line-items.js";
import { ACCOUNT_CLASS } from "../../src/constants.js";
import { nowAsCoreData } from "../../src/utils/date.js";

describe("Multi-currency balance - Issue #23", () => {
  let db: Database.Database;
  let testData: TestData;
  let accountRepo: AccountRepository;
  let transactionRepo: TransactionRepository;
  let lineItemRepo: LineItemRepository;
  let usdCurrencyId: number;
  let usdAccountId: number;

  beforeEach(() => {
    db = createTestDatabase();
    testData = seedTestDatabase(db); // Seeds EUR as default currency
    const connection = createMockConnection(db);
    accountRepo = new AccountRepository(connection as any);
    lineItemRepo = new LineItemRepository(db, connection.entityTypes, connection.tagJunctionColumn);
    transactionRepo = new TransactionRepository(connection as any, lineItemRepo);

    // Add USD as a second currency
    usdCurrencyId = db.prepare(
      `INSERT INTO ZCURRENCY (Z_ENT, Z_OPT, ZPCODE, ZPNAME) VALUES (4, 0, 'USD', 'US Dollar')`
    ).run().lastInsertRowid as number;

    // Create a USD checking account
    const now = nowAsCoreData();
    usdAccountId = db.prepare(`
      INSERT INTO ZACCOUNT (Z_ENT, Z_OPT, ZCURRENCY, ZPACCOUNTCLASS,
        ZPNAME, ZPFULLNAME, ZPCREATIONTIME, ZPMODIFICATIONDATE, ZPUNIQUEID)
      VALUES (3, 0, ?, ?, 'USD Checking', 'USD Checking', ?, ?, 'test-usd-acct')
    `).run(usdCurrencyId, ACCOUNT_CLASS.CHECKING, now, now).lastInsertRowid as number;
  });

  afterEach(() => {
    db.close();
  });

  /**
   * Helper: insert a cross-currency transaction directly via SQL.
   * The SDK's create method hardcodes ZPEXCHANGERATE=1.0, so we must
   * use raw SQL to set up multi-currency fixtures.
   */
  function insertCrossCurrencyTransaction(opts: {
    title: string;
    eurAccountId: number;
    usdAccountId: number;
    baseAmount: number;       // amount in base (USD) currency
    eurExchangeRate: number;  // multiplier: baseAmount * rate = EUR native amount
  }) {
    const now = nowAsCoreData();

    const txnId = db.prepare(`
      INSERT INTO ZTRANSACTION (Z_ENT, Z_OPT, ZPDATE, ZPTITLE, ZPUNIQUEID, ZPCREATIONTIME, ZPMODIFICATIONDATE)
      VALUES (53, 0, ?, ?, ?, ?, ?)
    `).run(now, opts.title, `txn-${Date.now()}-${Math.random()}`, now, now).lastInsertRowid as number;

    // EUR side: negative baseAmount with EUR exchange rate
    db.prepare(`
      INSERT INTO ZLINEITEM (Z_ENT, Z_OPT, ZPACCOUNT, ZPTRANSACTION,
        ZPTRANSACTIONAMOUNT, ZPEXCHANGERATE, ZPRUNNINGBALANCE, ZPCREATIONTIME, ZPUNIQUEID)
      VALUES (19, 0, ?, ?, ?, ?, 0, ?, ?)
    `).run(opts.eurAccountId, txnId, -opts.baseAmount, opts.eurExchangeRate, now, `li-eur-${Date.now()}-${Math.random()}`);

    // USD side: positive baseAmount with rate 1.0
    db.prepare(`
      INSERT INTO ZLINEITEM (Z_ENT, Z_OPT, ZPACCOUNT, ZPTRANSACTION,
        ZPTRANSACTIONAMOUNT, ZPEXCHANGERATE, ZPRUNNINGBALANCE, ZPCREATIONTIME, ZPUNIQUEID)
      VALUES (19, 0, ?, ?, ?, 1.0, 0, ?, ?)
    `).run(opts.usdAccountId, txnId, opts.baseAmount, now, `li-usd-${Date.now()}-${Math.random()}`);

    return txnId;
  }

  describe("getBalance", () => {
    it("should return correct native-currency balance for a EUR account with cross-currency transactions", () => {
      // EUR account receives -722.19 base * 0.949667 = -685.84 EUR native
      insertCrossCurrencyTransaction({
        title: "FX Transfer",
        eurAccountId: testData.accounts.checking,
        usdAccountId: usdAccountId,
        baseAmount: 722.19,
        eurExchangeRate: 0.949666985142414,
      });

      const eurBalance = accountRepo.getBalance(testData.accounts.checking);
      // Native EUR amount: -722.19 * 0.949666985142414 = -685.84
      expect(eurBalance).toBeCloseTo(-685.84, 2);
    });

    it("should return correct balance for USD account (exchange rate 1.0)", () => {
      insertCrossCurrencyTransaction({
        title: "FX Transfer",
        eurAccountId: testData.accounts.checking,
        usdAccountId: usdAccountId,
        baseAmount: 722.19,
        eurExchangeRate: 0.949666985142414,
      });

      const usdBalance = accountRepo.getBalance(usdAccountId);
      // Native USD amount: 722.19 * 1.0 = 722.19
      expect(usdBalance).toBeCloseTo(722.19, 2);
    });

    it("should correctly sum multiple cross-currency transactions", () => {
      // Two FX transfers into the EUR account
      insertCrossCurrencyTransaction({
        title: "FX Transfer 1",
        eurAccountId: testData.accounts.checking,
        usdAccountId: usdAccountId,
        baseAmount: 500.00,
        eurExchangeRate: 0.92,  // native: -500 * 0.92 = -460 EUR
      });

      insertCrossCurrencyTransaction({
        title: "FX Transfer 2",
        eurAccountId: testData.accounts.checking,
        usdAccountId: usdAccountId,
        baseAmount: 300.00,
        eurExchangeRate: 0.95,  // native: -300 * 0.95 = -285 EUR
      });

      const eurBalance = accountRepo.getBalance(testData.accounts.checking);
      // Total: -460 + -285 = -745 EUR
      expect(eurBalance).toBeCloseTo(-745, 2);
    });

    it("should handle mix of same-currency and cross-currency transactions", () => {
      // Same-currency EUR transaction (rate = 1.0)
      transactionRepo.create({
        title: "EUR Deposit",
        date: "2024-01-01",
        lineItems: [
          { accountId: testData.accounts.checking, amount: 1000 },
          { accountId: testData.accounts.salary, amount: -1000 },
        ],
      });

      // Cross-currency withdrawal: 722.19 base * 0.949667 = 685.84 EUR debit
      insertCrossCurrencyTransaction({
        title: "FX Withdrawal",
        eurAccountId: testData.accounts.checking,
        usdAccountId: usdAccountId,
        baseAmount: 722.19,
        eurExchangeRate: 0.949666985142414,
      });

      const eurBalance = accountRepo.getBalance(testData.accounts.checking);
      // 1000 (same-currency, rate=1.0) + (-685.84) = 314.16 EUR
      expect(eurBalance).toBeCloseTo(314.16, 2);
    });

    it("should still work correctly for single-currency accounts (regression)", () => {
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

  describe("getNetWorth", () => {
    it("should compute net worth using native-currency amounts for cross-currency transactions", () => {
      // EUR checking gets a deposit of 1000 EUR (same currency)
      transactionRepo.create({
        title: "EUR Salary",
        date: "2024-01-01",
        lineItems: [
          { accountId: testData.accounts.checking, amount: 2000 },
          { accountId: testData.accounts.salary, amount: -2000 },
        ],
      });

      // Cross-currency: EUR account debited 685.84 EUR, USD account credited 722.19 USD
      insertCrossCurrencyTransaction({
        title: "FX to USD",
        eurAccountId: testData.accounts.checking,
        usdAccountId: usdAccountId,
        baseAmount: 722.19,
        eurExchangeRate: 0.949666985142414,
      });

      const netWorth = accountRepo.getNetWorth();
      // EUR checking: 2000 + (-722.19 * 0.949667) = 2000 - 685.84 = 1314.16
      // USD checking: 722.19 * 1.0 = 722.19
      // Total assets: 1314.16 + 722.19 = 2036.35
      expect(netWorth.assets).toBeCloseTo(2036.35, 2);
      expect(netWorth.netWorth).toBeCloseTo(2036.35, 2);
    });
  });

  describe("getCategoryAnalysis", () => {
    it("should use native-currency amounts for expense category totals", () => {
      const now = nowAsCoreData();

      // Create a cross-currency expense: EUR checking -> expense category
      // where the expense line also has an exchange rate
      const txnId = db.prepare(`
        INSERT INTO ZTRANSACTION (Z_ENT, Z_OPT, ZPDATE, ZPTITLE, ZPUNIQUEID, ZPCREATIONTIME, ZPMODIFICATIONDATE)
        VALUES (53, 0, ?, 'Foreign Purchase', ?, ?, ?)
      `).run(now, `txn-cat-${Date.now()}`, now, now).lastInsertRowid as number;

      // Checking side: -100 base * 0.92 = -92 EUR native
      db.prepare(`
        INSERT INTO ZLINEITEM (Z_ENT, Z_OPT, ZPACCOUNT, ZPTRANSACTION,
          ZPTRANSACTIONAMOUNT, ZPEXCHANGERATE, ZPRUNNINGBALANCE, ZPCREATIONTIME, ZPUNIQUEID)
        VALUES (19, 0, ?, ?, -100, 0.92, 0, ?, ?)
      `).run(testData.accounts.checking, txnId, now, `li-chk-${Date.now()}`);

      // Expense category side: 100 base * 0.92 = 92 EUR native
      db.prepare(`
        INSERT INTO ZLINEITEM (Z_ENT, Z_OPT, ZPACCOUNT, ZPTRANSACTION,
          ZPTRANSACTIONAMOUNT, ZPEXCHANGERATE, ZPRUNNINGBALANCE, ZPCREATIONTIME, ZPUNIQUEID)
        VALUES (19, 0, ?, ?, 100, 0.92, 0, ?, ?)
      `).run(testData.accounts.groceries, txnId, now, `li-exp-${Date.now()}`);

      const analysis = accountRepo.getCategoryAnalysis("expense");
      const groceries = analysis.find((a) => a.category === "Groceries");
      expect(groceries).toBeDefined();
      // Native amount: 100 * 0.92 = 92
      expect(groceries!.total).toBeCloseTo(92, 2);
    });
  });

  describe("recalculateRunningBalances", () => {
    it("should use native-currency amounts when recalculating running balances", () => {
      const now = nowAsCoreData();

      // Same-currency transaction first
      transactionRepo.create({
        title: "EUR Deposit",
        date: "2024-01-01",
        lineItems: [
          { accountId: testData.accounts.checking, amount: 1000 },
          { accountId: testData.accounts.salary, amount: -1000 },
        ],
      });

      // Then a cross-currency transaction
      const txnId = db.prepare(`
        INSERT INTO ZTRANSACTION (Z_ENT, Z_OPT, ZPDATE, ZPTITLE, ZPUNIQUEID, ZPCREATIONTIME, ZPMODIFICATIONDATE)
        VALUES (53, 0, ?, 'FX Transfer', ?, ?, ?)
      `).run(now + 1, `txn-rb-${Date.now()}`, now, now).lastInsertRowid as number;

      // EUR side: -500 base * 0.92 = -460 EUR native
      const eurLineItemId = db.prepare(`
        INSERT INTO ZLINEITEM (Z_ENT, Z_OPT, ZPACCOUNT, ZPTRANSACTION,
          ZPTRANSACTIONAMOUNT, ZPEXCHANGERATE, ZPRUNNINGBALANCE, ZPCREATIONTIME, ZPUNIQUEID)
        VALUES (19, 0, ?, ?, -500, 0.92, 0, ?, ?)
      `).run(testData.accounts.checking, txnId, now, `li-rb-${Date.now()}`).lastInsertRowid as number;

      lineItemRepo.recalculateRunningBalances(testData.accounts.checking);

      // Check the running balance of the cross-currency line item
      const row = db.prepare(
        `SELECT ZPRUNNINGBALANCE as rb FROM ZLINEITEM WHERE Z_PK = ?`
      ).get(eurLineItemId) as { rb: number };

      // Running balance after: 1000 + (-500 * 0.92) = 1000 - 460 = 540
      expect(row.rb).toBeCloseTo(540, 2);
    });
  });
});
