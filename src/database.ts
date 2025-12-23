import Database from "better-sqlite3";
import path from "path";
import { randomUUID } from "crypto";

// Core Data uses 2001-01-01 as epoch, which is 978307200 seconds after Unix epoch
const CORE_DATA_EPOCH_OFFSET = 978307200;

// Core Data entity type constants (Z_ENT values)
const Z_ENT = {
  ACCOUNT: 1, // Base account type (rarely used directly)
  CATEGORY: 2, // Category accounts (income/expense)
  PRIMARY_ACCOUNT: 3, // Primary accounts (checking, savings, credit cards)
  LINEITEM: 19,
  LINEITEM_TEMPLATE: 21,
  PAYEE: 31,
  PAYEE_INFO: 33,
  RECURRING_TRANSACTION: 35,
  TAG: 47,
  TEMPLATE_SELECTOR: 48,
  IMPORT_SOURCE_TEMPLATE_SELECTOR: 49,
  SCHEDULED_TEMPLATE_SELECTOR: 52,
  TRANSACTION: 53,
  TRANSACTION_TEMPLATE: 54,
  TRANSACTION_TYPE: 55,
} as const;

// Account class constants
const ACCOUNT_CLASS = {
  SAVINGS: 1002,
  CHECKING: 1006,
  CREDIT_CARD: 5001,
  INCOME: 6000,
  EXPENSE: 7000,
} as const;

// Generate a UUID for ZPUNIQUEID fields
export function generateUUID(): string {
  return randomUUID().toUpperCase();
}

// Get current timestamp in Core Data format
export function nowAsCoreData(): number {
  return Math.floor(Date.now() / 1000) - CORE_DATA_EPOCH_OFFSET;
}

export interface Account {
  id: number;
  name: string;
  fullName: string;
  accountClass: number;
  accountType: string;
  hidden: boolean;
  currency: string | null;
}

export interface Transaction {
  id: number;
  date: string;
  title: string;
  note: string | null;
  cleared: boolean;
  voided: boolean;
  transactionType: string | null;
  lineItems: LineItem[];
}

export interface LineItem {
  id: number;
  accountId: number;
  accountName: string;
  amount: number;
  memo: string | null;
  runningBalance: number | null;
}

export interface CategorySpending {
  category: string;
  total: number;
  transactionCount: number;
}

export interface Payee {
  id: number;
  name: string;
  phone: string | null;
  street1: string | null;
  street2: string | null;
  street3: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  countryCode: string | null;
}

export interface TransactionTemplate {
  id: number;
  title: string;
  amount: number;
  currencyId: string | null;
  note: string | null;
  active: boolean;
  fixedAmount: boolean;
  lastAppliedDate: string | null;
  lineItems: LineItemTemplate[];
}

export interface LineItemTemplate {
  id: number;
  accountId: string;
  accountName: string | null;
  amount: number;
  memo: string | null;
  fixedAmount: boolean;
}

export interface ImportRule {
  id: number;
  templateId: number;
  templateTitle: string;
  pattern: string;
  accountId: string | null;
  payee: string | null;
}

export interface ScheduledTransaction {
  id: number;
  templateId: number;
  templateTitle: string;
  amount: number;
  startDate: string | null;
  nextDate: string | null;
  repeatInterval: number | null;
  repeatMultiplier: number | null;
  accountId: string | null;
  reminderDays: number | null;
  recurringTransactionId: number | null;
}

// Account class mappings
const ACCOUNT_CLASS_NAMES: Record<number, string> = {
  1002: "Savings/Investment",
  1006: "Checking",
  5001: "Credit Card",
  6000: "Income",
  7000: "Expense",
};

function getAccountType(accountClass: number): string {
  return ACCOUNT_CLASS_NAMES[accountClass] || `Unknown (${accountClass})`;
}

function coreDataToISO(timestamp: number): string {
  const unixTimestamp = timestamp + CORE_DATA_EPOCH_OFFSET;
  return new Date(unixTimestamp * 1000).toISOString().split("T")[0];
}

function isoToCoreData(isoDate: string): number {
  const date = new Date(isoDate);
  return Math.floor(date.getTime() / 1000) - CORE_DATA_EPOCH_OFFSET;
}

export class BanktivityDatabase {
  private db: Database.Database;

  constructor(bankFilePath: string, readonly = false) {
    const dbPath = path.join(bankFilePath, "StoreContent", "core.sql");
    this.db = new Database(dbPath, { readonly });
  }

  close(): void {
    this.db.close();
  }

  getAccounts(includeHidden = false): Account[] {
    const sql = `
      SELECT
        a.Z_PK as id,
        a.ZPNAME as name,
        a.ZPFULLNAME as fullName,
        a.ZPACCOUNTCLASS as accountClass,
        a.ZPHIDDEN as hidden,
        c.ZPCODE as currency
      FROM ZACCOUNT a
      LEFT JOIN ZCURRENCY c ON a.ZCURRENCY = c.Z_PK
      ${includeHidden ? "" : "WHERE a.ZPHIDDEN = 0 OR a.ZPHIDDEN IS NULL"}
      ORDER BY a.ZPACCOUNTCLASS, a.ZPNAME
    `;

    const rows = this.db.prepare(sql).all() as Array<{
      id: number;
      name: string;
      fullName: string;
      accountClass: number;
      hidden: number;
      currency: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      fullName: row.fullName,
      accountClass: row.accountClass,
      accountType: getAccountType(row.accountClass),
      hidden: row.hidden === 1,
      currency: row.currency,
    }));
  }

  getAccountBalance(accountId: number): number {
    const sql = `
      SELECT COALESCE(SUM(ZPTRANSACTIONAMOUNT), 0) as balance
      FROM ZLINEITEM
      WHERE ZPACCOUNT = ?
    `;

    const row = this.db.prepare(sql).get(accountId) as { balance: number };
    return row.balance;
  }

  getTransactions(options: {
    accountId?: number;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  } = {}): Transaction[] {
    const conditions: string[] = [];
    const params: (number | string)[] = [];

    if (options.accountId) {
      conditions.push("li.ZPACCOUNT = ?");
      params.push(options.accountId);
    }

    if (options.startDate) {
      conditions.push("t.ZPDATE >= ?");
      params.push(isoToCoreData(options.startDate));
    }

    if (options.endDate) {
      conditions.push("t.ZPDATE <= ?");
      params.push(isoToCoreData(options.endDate));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = options.limit ? `LIMIT ${options.limit}` : "";
    const offsetClause = options.offset ? `OFFSET ${options.offset}` : "";

    const sql = `
      SELECT DISTINCT
        t.Z_PK as id,
        t.ZPDATE as date,
        t.ZPTITLE as title,
        t.ZPNOTE as note,
        t.ZPCLEARED as cleared,
        t.ZPVOID as voided,
        tt.ZPNAME as transactionType
      FROM ZTRANSACTION t
      LEFT JOIN ZLINEITEM li ON li.ZPTRANSACTION = t.Z_PK
      LEFT JOIN ZTRANSACTIONTYPE tt ON t.ZPTRANSACTIONTYPE = tt.Z_PK
      ${whereClause}
      ORDER BY t.ZPDATE DESC
      ${limitClause}
      ${offsetClause}
    `;

    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: number;
      date: number;
      title: string;
      note: string | null;
      cleared: number;
      voided: number;
      transactionType: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      date: coreDataToISO(row.date),
      title: row.title,
      note: row.note,
      cleared: row.cleared === 1,
      voided: row.voided === 1,
      transactionType: row.transactionType,
      lineItems: this.getLineItemsForTransaction(row.id),
    }));
  }

  private getLineItemsForTransaction(transactionId: number): LineItem[] {
    const sql = `
      SELECT
        li.Z_PK as id,
        li.ZPACCOUNT as accountId,
        a.ZPNAME as accountName,
        li.ZPTRANSACTIONAMOUNT as amount,
        li.ZPMEMO as memo,
        li.ZPRUNNINGBALANCE as runningBalance
      FROM ZLINEITEM li
      JOIN ZACCOUNT a ON li.ZPACCOUNT = a.Z_PK
      WHERE li.ZPTRANSACTION = ?
      ORDER BY li.Z_PK
    `;

    const rows = this.db.prepare(sql).all(transactionId) as Array<{
      id: number;
      accountId: number;
      accountName: string;
      amount: number;
      memo: string | null;
      runningBalance: number | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      accountName: row.accountName,
      amount: row.amount,
      memo: row.memo,
      runningBalance: row.runningBalance,
    }));
  }

  searchTransactions(query: string, limit = 50): Transaction[] {
    const sql = `
      SELECT DISTINCT
        t.Z_PK as id,
        t.ZPDATE as date,
        t.ZPTITLE as title,
        t.ZPNOTE as note,
        t.ZPCLEARED as cleared,
        t.ZPVOID as voided,
        tt.ZPNAME as transactionType
      FROM ZTRANSACTION t
      LEFT JOIN ZTRANSACTIONTYPE tt ON t.ZPTRANSACTIONTYPE = tt.Z_PK
      WHERE t.ZPTITLE LIKE ? OR t.ZPNOTE LIKE ?
      ORDER BY t.ZPDATE DESC
      LIMIT ?
    `;

    const searchPattern = `%${query}%`;
    const rows = this.db.prepare(sql).all(searchPattern, searchPattern, limit) as Array<{
      id: number;
      date: number;
      title: string;
      note: string | null;
      cleared: number;
      voided: number;
      transactionType: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      date: coreDataToISO(row.date),
      title: row.title,
      note: row.note,
      cleared: row.cleared === 1,
      voided: row.voided === 1,
      transactionType: row.transactionType,
      lineItems: this.getLineItemsForTransaction(row.id),
    }));
  }

  getSpendingByCategory(options: {
    startDate?: string;
    endDate?: string;
  } = {}): CategorySpending[] {
    const conditions: string[] = ["a.ZPACCOUNTCLASS = 7000"]; // Expense categories only
    const params: (number | string)[] = [];

    if (options.startDate) {
      conditions.push("t.ZPDATE >= ?");
      params.push(isoToCoreData(options.startDate));
    }

    if (options.endDate) {
      conditions.push("t.ZPDATE <= ?");
      params.push(isoToCoreData(options.endDate));
    }

    const sql = `
      SELECT
        a.ZPNAME as category,
        SUM(li.ZPTRANSACTIONAMOUNT) as total,
        COUNT(DISTINCT t.Z_PK) as transactionCount
      FROM ZLINEITEM li
      JOIN ZACCOUNT a ON li.ZPACCOUNT = a.Z_PK
      JOIN ZTRANSACTION t ON li.ZPTRANSACTION = t.Z_PK
      WHERE ${conditions.join(" AND ")}
      GROUP BY a.ZPNAME
      ORDER BY total DESC
    `;

    const rows = this.db.prepare(sql).all(...params) as Array<{
      category: string;
      total: number;
      transactionCount: number;
    }>;

    return rows;
  }

  getIncomeByCategory(options: {
    startDate?: string;
    endDate?: string;
  } = {}): CategorySpending[] {
    const conditions: string[] = ["a.ZPACCOUNTCLASS = 6000"]; // Income categories only
    const params: (number | string)[] = [];

    if (options.startDate) {
      conditions.push("t.ZPDATE >= ?");
      params.push(isoToCoreData(options.startDate));
    }

    if (options.endDate) {
      conditions.push("t.ZPDATE <= ?");
      params.push(isoToCoreData(options.endDate));
    }

    const sql = `
      SELECT
        a.ZPNAME as category,
        SUM(li.ZPTRANSACTIONAMOUNT) as total,
        COUNT(DISTINCT t.Z_PK) as transactionCount
      FROM ZLINEITEM li
      JOIN ZACCOUNT a ON li.ZPACCOUNT = a.Z_PK
      JOIN ZTRANSACTION t ON li.ZPTRANSACTION = t.Z_PK
      WHERE ${conditions.join(" AND ")}
      GROUP BY a.ZPNAME
      ORDER BY total DESC
    `;

    const rows = this.db.prepare(sql).all(...params) as Array<{
      category: string;
      total: number;
      transactionCount: number;
    }>;

    return rows;
  }

  getNetWorth(): { assets: number; liabilities: number; netWorth: number } {
    // Assets: Checking (1006) + Savings/Investment (1002)
    const assetsSql = `
      SELECT COALESCE(SUM(li.ZPTRANSACTIONAMOUNT), 0) as total
      FROM ZLINEITEM li
      JOIN ZACCOUNT a ON li.ZPACCOUNT = a.Z_PK
      WHERE a.ZPACCOUNTCLASS IN (1002, 1006)
    `;

    // Liabilities: Credit Cards (5001)
    const liabilitiesSql = `
      SELECT COALESCE(SUM(li.ZPTRANSACTIONAMOUNT), 0) as total
      FROM ZLINEITEM li
      JOIN ZACCOUNT a ON li.ZPACCOUNT = a.Z_PK
      WHERE a.ZPACCOUNTCLASS = 5001
    `;

    const assets = (this.db.prepare(assetsSql).get() as { total: number }).total;
    const liabilities = (this.db.prepare(liabilitiesSql).get() as { total: number }).total;

    return {
      assets,
      liabilities,
      netWorth: assets + liabilities, // liabilities are already negative
    };
  }

  getTags(): Array<{ id: number; name: string }> {
    const sql = `SELECT Z_PK as id, ZPNAME as name FROM ZTAG ORDER BY ZPNAME`;
    return this.db.prepare(sql).all() as Array<{ id: number; name: string }>;
  }

  getTransactionCount(): number {
    const sql = `SELECT COUNT(*) as count FROM ZTRANSACTION`;
    return (this.db.prepare(sql).get() as { count: number }).count;
  }

  // ============================================
  // WRITE OPERATIONS
  // ============================================

  /**
   * Recalculate running balances for all line items in an account
   * This must be called after any transaction modification
   */
  recalculateRunningBalances(accountId: number): void {
    // Get all line items for this account ordered by transaction date
    const sql = `
      SELECT li.Z_PK as id, li.ZPTRANSACTIONAMOUNT as amount, t.ZPDATE as date
      FROM ZLINEITEM li
      JOIN ZTRANSACTION t ON li.ZPTRANSACTION = t.Z_PK
      WHERE li.ZPACCOUNT = ?
      ORDER BY t.ZPDATE ASC, li.Z_PK ASC
    `;

    const lineItems = this.db.prepare(sql).all(accountId) as Array<{
      id: number;
      amount: number;
      date: number;
    }>;

    let runningBalance = 0;
    const updateStmt = this.db.prepare(
      `UPDATE ZLINEITEM SET ZPRUNNINGBALANCE = ? WHERE Z_PK = ?`
    );

    const transaction = this.db.transaction(() => {
      for (const item of lineItems) {
        runningBalance += item.amount;
        updateStmt.run(runningBalance, item.id);
      }
    });

    transaction();
  }

  /**
   * Get account by ID
   */
  getAccountById(accountId: number): Account | null {
    const sql = `
      SELECT
        a.Z_PK as id,
        a.ZPNAME as name,
        a.ZPFULLNAME as fullName,
        a.ZPACCOUNTCLASS as accountClass,
        a.ZPHIDDEN as hidden,
        c.ZPCODE as currency
      FROM ZACCOUNT a
      LEFT JOIN ZCURRENCY c ON a.ZCURRENCY = c.Z_PK
      WHERE a.Z_PK = ?
    `;

    const row = this.db.prepare(sql).get(accountId) as {
      id: number;
      name: string;
      fullName: string;
      accountClass: number;
      hidden: number;
      currency: string | null;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      fullName: row.fullName,
      accountClass: row.accountClass,
      accountType: getAccountType(row.accountClass),
      hidden: row.hidden === 1,
      currency: row.currency,
    };
  }

  /**
   * Get transaction type ID by name
   */
  getTransactionTypeId(typeName: string): number | null {
    const sql = `SELECT Z_PK as id FROM ZTRANSACTIONTYPE WHERE ZPNAME = ? OR ZPSHORTNAME = ?`;
    const row = this.db.prepare(sql).get(typeName, typeName) as { id: number } | undefined;
    return row?.id ?? null;
  }

  /**
   * Get default currency ID (first currency in database)
   */
  getDefaultCurrencyId(): number | null {
    const sql = `SELECT Z_PK as id FROM ZCURRENCY LIMIT 1`;
    const row = this.db.prepare(sql).get() as { id: number } | undefined;
    return row?.id ?? null;
  }

  /**
   * Create a new transaction with line items
   */
  createTransaction(options: {
    title: string;
    date: string;
    note?: string;
    transactionType?: string;
    lineItems: Array<{
      accountId: number;
      amount: number;
      memo?: string;
    }>;
  }): { transactionId: number; lineItemIds: number[] } {
    const now = nowAsCoreData();
    const transactionDate = isoToCoreData(options.date);
    const transactionUUID = generateUUID();
    const currencyId = this.getDefaultCurrencyId();
    const transactionTypeId = options.transactionType
      ? this.getTransactionTypeId(options.transactionType)
      : null;

    const result = { transactionId: 0, lineItemIds: [] as number[] };
    const affectedAccounts = new Set<number>();

    const transaction = this.db.transaction(() => {
      // Insert transaction
      const insertTransaction = this.db.prepare(`
        INSERT INTO ZTRANSACTION (
          Z_ENT, Z_OPT, ZPTRANSACTIONTYPE, ZPCURRENCY,
          ZPCREATIONTIME, ZPDATE, ZPMODIFICATIONDATE,
          ZPTITLE, ZPNOTE, ZPUNIQUEID, ZPCLEARED, ZPVOID
        ) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
      `);

      const txResult = insertTransaction.run(
        Z_ENT.TRANSACTION,
        transactionTypeId,
        currencyId,
        now,
        transactionDate,
        now,
        options.title,
        options.note ?? null,
        transactionUUID
      );

      result.transactionId = txResult.lastInsertRowid as number;

      // Insert line items
      const insertLineItem = this.db.prepare(`
        INSERT INTO ZLINEITEM (
          Z_ENT, Z_OPT, ZPACCOUNT, ZPTRANSACTION,
          ZPCREATIONTIME, ZPTRANSACTIONAMOUNT, ZPEXCHANGERATE,
          ZPRUNNINGBALANCE, ZPMEMO, ZPUNIQUEID, ZPCLEARED
        ) VALUES (?, 0, ?, ?, ?, ?, 1.0, 0, ?, ?, 0)
      `);

      for (const item of options.lineItems) {
        const lineItemUUID = generateUUID();
        const liResult = insertLineItem.run(
          Z_ENT.LINEITEM,
          item.accountId,
          result.transactionId,
          now,
          item.amount,
          item.memo ?? null,
          lineItemUUID
        );
        result.lineItemIds.push(liResult.lastInsertRowid as number);
        affectedAccounts.add(item.accountId);
      }
    });

    transaction();

    // Recalculate running balances for affected accounts
    for (const accountId of affectedAccounts) {
      this.recalculateRunningBalances(accountId);
    }

    return result;
  }

  /**
   * Update an existing transaction
   */
  updateTransaction(
    transactionId: number,
    updates: {
      title?: string;
      date?: string;
      note?: string;
      cleared?: boolean;
    }
  ): boolean {
    const setClauses: string[] = [];
    const params: (string | number | null)[] = [];

    if (updates.title !== undefined) {
      setClauses.push("ZPTITLE = ?");
      params.push(updates.title);
    }

    if (updates.date !== undefined) {
      setClauses.push("ZPDATE = ?");
      params.push(isoToCoreData(updates.date));
    }

    if (updates.note !== undefined) {
      setClauses.push("ZPNOTE = ?");
      params.push(updates.note);
    }

    if (updates.cleared !== undefined) {
      setClauses.push("ZPCLEARED = ?");
      params.push(updates.cleared ? 1 : 0);
    }

    if (setClauses.length === 0) return false;

    // Always update modification time and increment Z_OPT
    setClauses.push("ZPMODIFICATIONDATE = ?");
    params.push(nowAsCoreData());

    setClauses.push("Z_OPT = Z_OPT + 1");

    params.push(transactionId);

    const sql = `UPDATE ZTRANSACTION SET ${setClauses.join(", ")} WHERE Z_PK = ?`;
    const result = this.db.prepare(sql).run(...params);

    // If date changed, recalculate running balances for affected accounts
    if (updates.date !== undefined && result.changes > 0) {
      const accountIds = this.getAccountIdsForTransaction(transactionId);
      for (const accountId of accountIds) {
        this.recalculateRunningBalances(accountId);
      }
    }

    return result.changes > 0;
  }

  /**
   * Get account IDs for a transaction's line items
   */
  private getAccountIdsForTransaction(transactionId: number): number[] {
    const sql = `SELECT DISTINCT ZPACCOUNT as accountId FROM ZLINEITEM WHERE ZPTRANSACTION = ?`;
    const rows = this.db.prepare(sql).all(transactionId) as Array<{ accountId: number }>;
    return rows.map((r) => r.accountId);
  }

  /**
   * Delete a transaction and its line items
   */
  deleteTransaction(transactionId: number): boolean {
    const affectedAccounts = this.getAccountIdsForTransaction(transactionId);

    const transaction = this.db.transaction(() => {
      // Delete tag associations first
      this.db.prepare(`
        DELETE FROM Z_19PTAGS WHERE Z_19PLINEITEMS IN (
          SELECT Z_PK FROM ZLINEITEM WHERE ZPTRANSACTION = ?
        )
      `).run(transactionId);

      // Delete line items
      this.db.prepare(`DELETE FROM ZLINEITEM WHERE ZPTRANSACTION = ?`).run(transactionId);

      // Delete transaction
      this.db.prepare(`DELETE FROM ZTRANSACTION WHERE Z_PK = ?`).run(transactionId);
    });

    transaction();

    // Recalculate running balances for affected accounts
    for (const accountId of affectedAccounts) {
      this.recalculateRunningBalances(accountId);
    }

    return true;
  }

  /**
   * Create a new account
   */
  createAccount(options: {
    name: string;
    fullName?: string;
    accountClass: number;
    currencyCode?: string;
    hidden?: boolean;
  }): number {
    const now = nowAsCoreData();
    const uuid = generateUUID();

    // Get currency ID
    let currencyId: number | null = null;
    if (options.currencyCode) {
      const sql = `SELECT Z_PK as id FROM ZCURRENCY WHERE ZPCODE = ?`;
      const row = this.db.prepare(sql).get(options.currencyCode) as { id: number } | undefined;
      currencyId = row?.id ?? null;
    }
    if (!currencyId) {
      currencyId = this.getDefaultCurrencyId();
    }

    // Determine if this is a debit account (assets are debit, liabilities are credit)
    const isDebit = options.accountClass !== ACCOUNT_CLASS.CREDIT_CARD;

    // Determine entity type: Categories (income/expense) use Z_ENT=2, Primary accounts use Z_ENT=3
    const isCategory = options.accountClass === ACCOUNT_CLASS.INCOME ||
                       options.accountClass === ACCOUNT_CLASS.EXPENSE;
    const entityType = isCategory ? Z_ENT.CATEGORY : Z_ENT.PRIMARY_ACCOUNT;

    const sql = `
      INSERT INTO ZACCOUNT (
        Z_ENT, Z_OPT, ZPACCOUNTCLASS, ZPDEBIT, ZPHIDDEN, ZPTAXABLE,
        ZCURRENCY, ZPCREATIONTIME, ZPMODIFICATIONDATE,
        ZPNAME, ZPFULLNAME, ZPUNIQUEID
      ) VALUES (?, 0, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
    `;

    const result = this.db.prepare(sql).run(
      entityType,
      options.accountClass,
      isDebit ? 1 : 0,
      options.hidden ? 1 : 0,
      currencyId,
      now,
      now,
      options.name,
      options.fullName ?? options.name,
      uuid
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Create a new tag
   */
  createTag(name: string): number {
    const now = nowAsCoreData();
    const uuid = generateUUID();
    // Banktivity stores canonical names in UPPERCASE
    const canonicalName = name.toUpperCase().trim();

    // Check if tag already exists
    const existing = this.db.prepare(
      `SELECT Z_PK as id FROM ZTAG WHERE ZPCANONICALNAME = ?`
    ).get(canonicalName) as { id: number } | undefined;

    if (existing) {
      return existing.id;
    }

    const sql = `
      INSERT INTO ZTAG (
        Z_ENT, Z_OPT, ZPCREATIONTIME, ZPMODIFICATIONDATE,
        ZPNAME, ZPCANONICALNAME, ZPUNIQUEID
      ) VALUES (?, 0, ?, ?, ?, ?, ?)
    `;

    const result = this.db.prepare(sql).run(
      Z_ENT.TAG,
      now,
      now,
      name.trim(),
      canonicalName,
      uuid
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Add a tag to a line item
   */
  addTagToLineItem(lineItemId: number, tagId: number): boolean {
    // Check if association already exists
    const existing = this.db.prepare(
      `SELECT 1 FROM Z_19PTAGS WHERE Z_19PLINEITEMS = ? AND Z_47PTAGS = ?`
    ).get(lineItemId, tagId);

    if (existing) return false;

    const sql = `INSERT INTO Z_19PTAGS (Z_19PLINEITEMS, Z_47PTAGS) VALUES (?, ?)`;
    this.db.prepare(sql).run(lineItemId, tagId);
    return true;
  }

  /**
   * Remove a tag from a line item
   */
  removeTagFromLineItem(lineItemId: number, tagId: number): boolean {
    const sql = `DELETE FROM Z_19PTAGS WHERE Z_19PLINEITEMS = ? AND Z_47PTAGS = ?`;
    const result = this.db.prepare(sql).run(lineItemId, tagId);
    return result.changes > 0;
  }

  /**
   * Tag all line items in a transaction
   */
  tagTransaction(transactionId: number, tagId: number): number {
    const lineItems = this.db.prepare(
      `SELECT Z_PK as id FROM ZLINEITEM WHERE ZPTRANSACTION = ?`
    ).all(transactionId) as Array<{ id: number }>;

    let added = 0;
    for (const item of lineItems) {
      if (this.addTagToLineItem(item.id, tagId)) {
        added++;
      }
    }
    return added;
  }

  /**
   * Remove a tag from all line items in a transaction
   */
  untagTransaction(transactionId: number, tagId: number): number {
    const lineItems = this.db.prepare(
      `SELECT Z_PK as id FROM ZLINEITEM WHERE ZPTRANSACTION = ?`
    ).all(transactionId) as Array<{ id: number }>;

    let removed = 0;
    for (const item of lineItems) {
      if (this.removeTagFromLineItem(item.id, tagId)) {
        removed++;
      }
    }
    return removed;
  }

  /**
   * Mark transactions as cleared/reconciled
   */
  reconcileTransactions(transactionIds: number[], cleared = true): number {
    const now = nowAsCoreData();
    const sql = `
      UPDATE ZTRANSACTION
      SET ZPCLEARED = ?, ZPMODIFICATIONDATE = ?, Z_OPT = Z_OPT + 1
      WHERE Z_PK = ?
    `;
    const stmt = this.db.prepare(sql);

    let updated = 0;
    const transaction = this.db.transaction(() => {
      for (const id of transactionIds) {
        const result = stmt.run(cleared ? 1 : 0, now, id);
        updated += result.changes;
      }
    });

    transaction();
    return updated;
  }

  /**
   * Get a tag by name
   */
  getTagByName(name: string): { id: number; name: string } | null {
    // Banktivity stores canonical names in UPPERCASE
    const canonicalName = name.toUpperCase().trim();
    const sql = `SELECT Z_PK as id, ZPNAME as name FROM ZTAG WHERE ZPCANONICALNAME = ?`;
    const row = this.db.prepare(sql).get(canonicalName) as { id: number; name: string } | undefined;
    return row ?? null;
  }

  /**
   * Get transaction by ID
   */
  getTransactionById(transactionId: number): Transaction | null {
    const sql = `
      SELECT
        t.Z_PK as id,
        t.ZPDATE as date,
        t.ZPTITLE as title,
        t.ZPNOTE as note,
        t.ZPCLEARED as cleared,
        t.ZPVOID as voided,
        tt.ZPNAME as transactionType
      FROM ZTRANSACTION t
      LEFT JOIN ZTRANSACTIONTYPE tt ON t.ZPTRANSACTIONTYPE = tt.Z_PK
      WHERE t.Z_PK = ?
    `;

    const row = this.db.prepare(sql).get(transactionId) as {
      id: number;
      date: number;
      title: string;
      note: string | null;
      cleared: number;
      voided: number;
      transactionType: string | null;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      date: coreDataToISO(row.date),
      title: row.title,
      note: row.note,
      cleared: row.cleared === 1,
      voided: row.voided === 1,
      transactionType: row.transactionType,
      lineItems: this.getLineItemsForTransaction(row.id),
    };
  }

  // ============================================
  // PAYEE OPERATIONS
  // ============================================

  /**
   * Get all payees
   */
  getPayees(): Payee[] {
    const sql = `
      SELECT
        p.Z_PK as id,
        pi.ZPNAME as name,
        pi.ZPPHONE as phone,
        pi.ZPSTREET1 as street1,
        pi.ZPSTREET2 as street2,
        pi.ZPSTREET3 as street3,
        pi.ZPCITY as city,
        pi.ZPSTATE as state,
        pi.ZPPOSTALCODE as postalCode,
        pi.ZPCOUNTRYCODE as countryCode
      FROM ZPAYEE p
      JOIN ZPAYEEINFO pi ON p.ZPPAYEEINFO = pi.Z_PK
      ORDER BY pi.ZPNAME
    `;

    const rows = this.db.prepare(sql).all() as Array<{
      id: number;
      name: string;
      phone: string | null;
      street1: string | null;
      street2: string | null;
      street3: string | null;
      city: string | null;
      state: string | null;
      postalCode: string | null;
      countryCode: string | null;
    }>;

    return rows;
  }

  /**
   * Get payee by ID
   */
  getPayeeById(payeeId: number): Payee | null {
    const sql = `
      SELECT
        p.Z_PK as id,
        pi.ZPNAME as name,
        pi.ZPPHONE as phone,
        pi.ZPSTREET1 as street1,
        pi.ZPSTREET2 as street2,
        pi.ZPSTREET3 as street3,
        pi.ZPCITY as city,
        pi.ZPSTATE as state,
        pi.ZPPOSTALCODE as postalCode,
        pi.ZPCOUNTRYCODE as countryCode
      FROM ZPAYEE p
      JOIN ZPAYEEINFO pi ON p.ZPPAYEEINFO = pi.Z_PK
      WHERE p.Z_PK = ?
    `;

    const row = this.db.prepare(sql).get(payeeId) as Payee | undefined;
    return row ?? null;
  }

  /**
   * Create a new payee
   */
  createPayee(options: {
    name: string;
    phone?: string;
    street1?: string;
    street2?: string;
    street3?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    countryCode?: string;
  }): number {
    const now = nowAsCoreData();

    let payeeId = 0;

    const transaction = this.db.transaction(() => {
      // First create PayeeInfo
      const insertPayeeInfo = this.db.prepare(`
        INSERT INTO ZPAYEEINFO (
          Z_ENT, Z_OPT, ZPNAME, ZPPHONE, ZPSTREET1, ZPSTREET2, ZPSTREET3,
          ZPCITY, ZPSTATE, ZPPOSTALCODE, ZPCOUNTRYCODE
        ) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const payeeInfoResult = insertPayeeInfo.run(
        Z_ENT.PAYEE_INFO,
        options.name,
        options.phone ?? null,
        options.street1 ?? null,
        options.street2 ?? null,
        options.street3 ?? null,
        options.city ?? null,
        options.state ?? null,
        options.postalCode ?? null,
        options.countryCode ?? null
      );

      const payeeInfoId = payeeInfoResult.lastInsertRowid as number;

      // Then create Payee linking to PayeeInfo
      const insertPayee = this.db.prepare(`
        INSERT INTO ZPAYEE (Z_ENT, Z_OPT, ZPPAYEEINFO)
        VALUES (?, 0, ?)
      `);

      const payeeResult = insertPayee.run(Z_ENT.PAYEE, payeeInfoId);
      payeeId = payeeResult.lastInsertRowid as number;
    });

    transaction();
    return payeeId;
  }

  /**
   * Update a payee
   */
  updatePayee(
    payeeId: number,
    updates: {
      name?: string;
      phone?: string;
      street1?: string;
      street2?: string;
      street3?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      countryCode?: string;
    }
  ): boolean {
    // Get PayeeInfo ID
    const payee = this.db.prepare(
      `SELECT ZPPAYEEINFO as payeeInfoId FROM ZPAYEE WHERE Z_PK = ?`
    ).get(payeeId) as { payeeInfoId: number } | undefined;

    if (!payee) return false;

    const setClauses: string[] = [];
    const params: (string | null)[] = [];

    if (updates.name !== undefined) {
      setClauses.push("ZPNAME = ?");
      params.push(updates.name);
    }
    if (updates.phone !== undefined) {
      setClauses.push("ZPPHONE = ?");
      params.push(updates.phone);
    }
    if (updates.street1 !== undefined) {
      setClauses.push("ZPSTREET1 = ?");
      params.push(updates.street1);
    }
    if (updates.street2 !== undefined) {
      setClauses.push("ZPSTREET2 = ?");
      params.push(updates.street2);
    }
    if (updates.street3 !== undefined) {
      setClauses.push("ZPSTREET3 = ?");
      params.push(updates.street3);
    }
    if (updates.city !== undefined) {
      setClauses.push("ZPCITY = ?");
      params.push(updates.city);
    }
    if (updates.state !== undefined) {
      setClauses.push("ZPSTATE = ?");
      params.push(updates.state);
    }
    if (updates.postalCode !== undefined) {
      setClauses.push("ZPPOSTALCODE = ?");
      params.push(updates.postalCode);
    }
    if (updates.countryCode !== undefined) {
      setClauses.push("ZPCOUNTRYCODE = ?");
      params.push(updates.countryCode);
    }

    if (setClauses.length === 0) return false;

    params.push(payee.payeeInfoId.toString());

    const sql = `UPDATE ZPAYEEINFO SET ${setClauses.join(", ")} WHERE Z_PK = ?`;
    const result = this.db.prepare(sql).run(...params);

    return result.changes > 0;
  }

  /**
   * Delete a payee
   */
  deletePayee(payeeId: number): boolean {
    // Get PayeeInfo ID
    const payee = this.db.prepare(
      `SELECT ZPPAYEEINFO as payeeInfoId FROM ZPAYEE WHERE Z_PK = ?`
    ).get(payeeId) as { payeeInfoId: number } | undefined;

    if (!payee) return false;

    const transaction = this.db.transaction(() => {
      // Delete payee first
      this.db.prepare(`DELETE FROM ZPAYEE WHERE Z_PK = ?`).run(payeeId);
      // Then delete payee info
      this.db.prepare(`DELETE FROM ZPAYEEINFO WHERE Z_PK = ?`).run(payee.payeeInfoId);
    });

    transaction();
    return true;
  }

  // ============================================
  // TRANSACTION TEMPLATE OPERATIONS
  // ============================================

  /**
   * Get all transaction templates
   */
  getTransactionTemplates(): TransactionTemplate[] {
    const sql = `
      SELECT
        Z_PK as id,
        ZPTITLE as title,
        ZPAMOUNT as amount,
        ZPCURRENCYID as currencyId,
        ZPNOTE as note,
        ZPACTIVE as active,
        ZPFIXEDAMOUNT as fixedAmount,
        ZPLASTAPPLIEDDATE as lastAppliedDate
      FROM ZTRANSACTIONTEMPLATE
      ORDER BY ZPTITLE
    `;

    const rows = this.db.prepare(sql).all() as Array<{
      id: number;
      title: string;
      amount: number;
      currencyId: string | null;
      note: string | null;
      active: number | null;
      fixedAmount: number | null;
      lastAppliedDate: number | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      amount: row.amount,
      currencyId: row.currencyId,
      note: row.note,
      active: row.active === 1,
      fixedAmount: row.fixedAmount === 1,
      lastAppliedDate: row.lastAppliedDate ? coreDataToISO(row.lastAppliedDate) : null,
      lineItems: this.getLineItemTemplatesForTemplate(row.id),
    }));
  }

  /**
   * Get line item templates for a transaction template
   */
  private getLineItemTemplatesForTemplate(templateId: number): LineItemTemplate[] {
    const sql = `
      SELECT
        lit.Z_PK as id,
        lit.ZPACCOUNTID as accountId,
        a.ZPNAME as accountName,
        lit.ZPTRANSACTIONAMOUNT as amount,
        lit.ZPMEMO as memo,
        lit.ZPFIXEDAMOUNT as fixedAmount
      FROM ZLINEITEMTEMPLATE lit
      LEFT JOIN ZACCOUNT a ON lit.ZPACCOUNTID = a.ZPUNIQUEID
      WHERE lit.ZPTRANSACTIONTEMPLATE = ?
    `;

    const rows = this.db.prepare(sql).all(templateId) as Array<{
      id: number;
      accountId: string;
      accountName: string | null;
      amount: number;
      memo: string | null;
      fixedAmount: number | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      accountName: row.accountName,
      amount: row.amount,
      memo: row.memo,
      fixedAmount: row.fixedAmount === 1,
    }));
  }

  /**
   * Get transaction template by ID
   */
  getTransactionTemplateById(templateId: number): TransactionTemplate | null {
    const sql = `
      SELECT
        Z_PK as id,
        ZPTITLE as title,
        ZPAMOUNT as amount,
        ZPCURRENCYID as currencyId,
        ZPNOTE as note,
        ZPACTIVE as active,
        ZPFIXEDAMOUNT as fixedAmount,
        ZPLASTAPPLIEDDATE as lastAppliedDate
      FROM ZTRANSACTIONTEMPLATE
      WHERE Z_PK = ?
    `;

    const row = this.db.prepare(sql).get(templateId) as {
      id: number;
      title: string;
      amount: number;
      currencyId: string | null;
      note: string | null;
      active: number | null;
      fixedAmount: number | null;
      lastAppliedDate: number | null;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      title: row.title,
      amount: row.amount,
      currencyId: row.currencyId,
      note: row.note,
      active: row.active === 1,
      fixedAmount: row.fixedAmount === 1,
      lastAppliedDate: row.lastAppliedDate ? coreDataToISO(row.lastAppliedDate) : null,
      lineItems: this.getLineItemTemplatesForTemplate(row.id),
    };
  }

  /**
   * Create a transaction template
   */
  createTransactionTemplate(options: {
    title: string;
    amount: number;
    note?: string;
    currencyId?: string;
    lineItems?: Array<{
      accountId: string;
      amount: number;
      memo?: string;
    }>;
  }): number {
    const now = nowAsCoreData();
    const uuid = generateUUID();

    let templateId = 0;

    const transaction = this.db.transaction(() => {
      const insertTemplate = this.db.prepare(`
        INSERT INTO ZTRANSACTIONTEMPLATE (
          Z_ENT, Z_OPT, ZPACTIVE, ZPFIXEDAMOUNT,
          ZPCREATIONTIME, ZPMODIFICATIONDATE,
          ZPAMOUNT, ZPCURRENCYID, ZPNOTE, ZPTITLE, ZPUNIQUEID
        ) VALUES (?, 0, 1, 1, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = insertTemplate.run(
        Z_ENT.TRANSACTION_TEMPLATE,
        now,
        now,
        options.amount,
        options.currencyId ?? null,
        options.note ?? null,
        options.title,
        uuid
      );

      templateId = result.lastInsertRowid as number;

      // Add line items if provided
      if (options.lineItems && options.lineItems.length > 0) {
        const insertLineItem = this.db.prepare(`
          INSERT INTO ZLINEITEMTEMPLATE (
            Z_ENT, Z_OPT, ZPFIXEDAMOUNT, ZPTRANSACTIONTEMPLATE,
            ZPCREATIONTIME, ZPTRANSACTIONAMOUNT, ZPACCOUNTID, ZPMEMO
          ) VALUES (?, 0, 1, ?, ?, ?, ?, ?)
        `);

        for (const item of options.lineItems) {
          insertLineItem.run(
            Z_ENT.LINEITEM_TEMPLATE,
            templateId,
            now,
            item.amount,
            item.accountId,
            item.memo ?? null
          );
        }
      }
    });

    transaction();
    return templateId;
  }

  /**
   * Update a transaction template
   */
  updateTransactionTemplate(
    templateId: number,
    updates: {
      title?: string;
      amount?: number;
      note?: string;
      active?: boolean;
    }
  ): boolean {
    const setClauses: string[] = [];
    const params: (string | number | null)[] = [];

    if (updates.title !== undefined) {
      setClauses.push("ZPTITLE = ?");
      params.push(updates.title);
    }
    if (updates.amount !== undefined) {
      setClauses.push("ZPAMOUNT = ?");
      params.push(updates.amount);
    }
    if (updates.note !== undefined) {
      setClauses.push("ZPNOTE = ?");
      params.push(updates.note);
    }
    if (updates.active !== undefined) {
      setClauses.push("ZPACTIVE = ?");
      params.push(updates.active ? 1 : 0);
    }

    if (setClauses.length === 0) return false;

    setClauses.push("ZPMODIFICATIONDATE = ?");
    params.push(nowAsCoreData());

    params.push(templateId);

    const sql = `UPDATE ZTRANSACTIONTEMPLATE SET ${setClauses.join(", ")} WHERE Z_PK = ?`;
    const result = this.db.prepare(sql).run(...params);

    return result.changes > 0;
  }

  /**
   * Delete a transaction template and related items
   */
  deleteTransactionTemplate(templateId: number): boolean {
    const transaction = this.db.transaction(() => {
      // Delete line item templates
      this.db.prepare(`DELETE FROM ZLINEITEMTEMPLATE WHERE ZPTRANSACTIONTEMPLATE = ?`).run(templateId);
      // Delete template selectors (import rules and scheduled transactions)
      this.db.prepare(`DELETE FROM ZTEMPLATESELECTOR WHERE ZPTRANSACTIONTEMPLATE = ?`).run(templateId);
      // Delete template
      this.db.prepare(`DELETE FROM ZTRANSACTIONTEMPLATE WHERE Z_PK = ?`).run(templateId);
    });

    transaction();
    return true;
  }

  // ============================================
  // IMPORT RULE OPERATIONS
  // ============================================

  /**
   * Get all import rules
   */
  getImportRules(): ImportRule[] {
    const sql = `
      SELECT
        ts.Z_PK as id,
        ts.ZPTRANSACTIONTEMPLATE as templateId,
        tt.ZPTITLE as templateTitle,
        ts.ZPDETAILSEXPRESSION as pattern,
        ts.ZPACCOUNTID as accountId,
        ts.ZPPAYEE as payee
      FROM ZTEMPLATESELECTOR ts
      JOIN ZTRANSACTIONTEMPLATE tt ON ts.ZPTRANSACTIONTEMPLATE = tt.Z_PK
      WHERE ts.Z_ENT = ?
      ORDER BY tt.ZPTITLE
    `;

    const rows = this.db.prepare(sql).all(Z_ENT.IMPORT_SOURCE_TEMPLATE_SELECTOR) as Array<{
      id: number;
      templateId: number;
      templateTitle: string;
      pattern: string;
      accountId: string | null;
      payee: string | null;
    }>;

    return rows;
  }

  /**
   * Get import rule by ID
   */
  getImportRuleById(ruleId: number): ImportRule | null {
    const sql = `
      SELECT
        ts.Z_PK as id,
        ts.ZPTRANSACTIONTEMPLATE as templateId,
        tt.ZPTITLE as templateTitle,
        ts.ZPDETAILSEXPRESSION as pattern,
        ts.ZPACCOUNTID as accountId,
        ts.ZPPAYEE as payee
      FROM ZTEMPLATESELECTOR ts
      JOIN ZTRANSACTIONTEMPLATE tt ON ts.ZPTRANSACTIONTEMPLATE = tt.Z_PK
      WHERE ts.Z_PK = ? AND ts.Z_ENT = ?
    `;

    const row = this.db.prepare(sql).get(ruleId, Z_ENT.IMPORT_SOURCE_TEMPLATE_SELECTOR) as ImportRule | undefined;
    return row ?? null;
  }

  /**
   * Create an import rule
   */
  createImportRule(options: {
    templateId: number;
    pattern: string;
    accountId?: string;
    payee?: string;
  }): number {
    const now = nowAsCoreData();
    const uuid = generateUUID();

    const sql = `
      INSERT INTO ZTEMPLATESELECTOR (
        Z_ENT, Z_OPT, ZPTRANSACTIONTEMPLATE,
        ZPCREATIONTIME, ZPMODIFICATIONDATE,
        ZPDETAILSEXPRESSION, ZPACCOUNTID, ZPPAYEE, ZPUNIQUEID
      ) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = this.db.prepare(sql).run(
      Z_ENT.IMPORT_SOURCE_TEMPLATE_SELECTOR,
      options.templateId,
      now,
      now,
      options.pattern,
      options.accountId ?? null,
      options.payee ?? null,
      uuid
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Update an import rule
   */
  updateImportRule(
    ruleId: number,
    updates: {
      pattern?: string;
      accountId?: string;
      payee?: string;
    }
  ): boolean {
    const setClauses: string[] = [];
    const params: (string | null)[] = [];

    if (updates.pattern !== undefined) {
      setClauses.push("ZPDETAILSEXPRESSION = ?");
      params.push(updates.pattern);
    }
    if (updates.accountId !== undefined) {
      setClauses.push("ZPACCOUNTID = ?");
      params.push(updates.accountId);
    }
    if (updates.payee !== undefined) {
      setClauses.push("ZPPAYEE = ?");
      params.push(updates.payee);
    }

    if (setClauses.length === 0) return false;

    setClauses.push("ZPMODIFICATIONDATE = ?");
    params.push(nowAsCoreData().toString());

    params.push(ruleId.toString());

    const sql = `UPDATE ZTEMPLATESELECTOR SET ${setClauses.join(", ")} WHERE Z_PK = ? AND Z_ENT = ${Z_ENT.IMPORT_SOURCE_TEMPLATE_SELECTOR}`;
    const result = this.db.prepare(sql).run(...params);

    return result.changes > 0;
  }

  /**
   * Delete an import rule
   */
  deleteImportRule(ruleId: number): boolean {
    const sql = `DELETE FROM ZTEMPLATESELECTOR WHERE Z_PK = ? AND Z_ENT = ?`;
    const result = this.db.prepare(sql).run(ruleId, Z_ENT.IMPORT_SOURCE_TEMPLATE_SELECTOR);
    return result.changes > 0;
  }

  /**
   * Match a transaction description against import rules
   */
  matchImportRules(description: string): ImportRule[] {
    const rules = this.getImportRules();
    const matches: ImportRule[] = [];

    for (const rule of rules) {
      try {
        const regex = new RegExp(rule.pattern, "i");
        if (regex.test(description)) {
          matches.push(rule);
        }
      } catch {
        // Invalid regex, skip
      }
    }

    return matches;
  }

  // ============================================
  // SCHEDULED TRANSACTION OPERATIONS
  // ============================================

  /**
   * Get all scheduled transactions
   */
  getScheduledTransactions(): ScheduledTransaction[] {
    const sql = `
      SELECT
        ts.Z_PK as id,
        ts.ZPTRANSACTIONTEMPLATE as templateId,
        tt.ZPTITLE as templateTitle,
        tt.ZPAMOUNT as amount,
        ts.ZPSTARTDATE as startDate,
        ts.ZPEXTERNALCALENDARNEXTDATE as nextDate,
        ts.ZPREPEATINTERVAL as repeatInterval,
        ts.ZPREPEATMULTIPLIER as repeatMultiplier,
        ts.ZPACCOUNTID as accountId,
        ts.ZPREMINDDAYSINADVANCE as reminderDays,
        ts.ZPRECURRINGTRANSACTION as recurringTransactionId
      FROM ZTEMPLATESELECTOR ts
      JOIN ZTRANSACTIONTEMPLATE tt ON ts.ZPTRANSACTIONTEMPLATE = tt.Z_PK
      WHERE ts.Z_ENT = ?
      ORDER BY ts.ZPSTARTDATE
    `;

    const rows = this.db.prepare(sql).all(Z_ENT.SCHEDULED_TEMPLATE_SELECTOR) as Array<{
      id: number;
      templateId: number;
      templateTitle: string;
      amount: number;
      startDate: number | null;
      nextDate: number | null;
      repeatInterval: number | null;
      repeatMultiplier: number | null;
      accountId: string | null;
      reminderDays: number | null;
      recurringTransactionId: number | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      templateId: row.templateId,
      templateTitle: row.templateTitle,
      amount: row.amount,
      startDate: row.startDate ? coreDataToISO(row.startDate) : null,
      nextDate: row.nextDate ? coreDataToISO(row.nextDate) : null,
      repeatInterval: row.repeatInterval,
      repeatMultiplier: row.repeatMultiplier,
      accountId: row.accountId,
      reminderDays: row.reminderDays,
      recurringTransactionId: row.recurringTransactionId,
    }));
  }

  /**
   * Get scheduled transaction by ID
   */
  getScheduledTransactionById(scheduleId: number): ScheduledTransaction | null {
    const sql = `
      SELECT
        ts.Z_PK as id,
        ts.ZPTRANSACTIONTEMPLATE as templateId,
        tt.ZPTITLE as templateTitle,
        tt.ZPAMOUNT as amount,
        ts.ZPSTARTDATE as startDate,
        ts.ZPEXTERNALCALENDARNEXTDATE as nextDate,
        ts.ZPREPEATINTERVAL as repeatInterval,
        ts.ZPREPEATMULTIPLIER as repeatMultiplier,
        ts.ZPACCOUNTID as accountId,
        ts.ZPREMINDDAYSINADVANCE as reminderDays,
        ts.ZPRECURRINGTRANSACTION as recurringTransactionId
      FROM ZTEMPLATESELECTOR ts
      JOIN ZTRANSACTIONTEMPLATE tt ON ts.ZPTRANSACTIONTEMPLATE = tt.Z_PK
      WHERE ts.Z_PK = ? AND ts.Z_ENT = ?
    `;

    const row = this.db.prepare(sql).get(scheduleId, Z_ENT.SCHEDULED_TEMPLATE_SELECTOR) as {
      id: number;
      templateId: number;
      templateTitle: string;
      amount: number;
      startDate: number | null;
      nextDate: number | null;
      repeatInterval: number | null;
      repeatMultiplier: number | null;
      accountId: string | null;
      reminderDays: number | null;
      recurringTransactionId: number | null;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      templateId: row.templateId,
      templateTitle: row.templateTitle,
      amount: row.amount,
      startDate: row.startDate ? coreDataToISO(row.startDate) : null,
      nextDate: row.nextDate ? coreDataToISO(row.nextDate) : null,
      repeatInterval: row.repeatInterval,
      repeatMultiplier: row.repeatMultiplier,
      accountId: row.accountId,
      reminderDays: row.reminderDays,
      recurringTransactionId: row.recurringTransactionId,
    };
  }

  /**
   * Create a scheduled transaction
   */
  createScheduledTransaction(options: {
    templateId: number;
    startDate: string;
    accountId?: string;
    repeatInterval?: number;
    repeatMultiplier?: number;
    reminderDays?: number;
  }): number {
    const now = nowAsCoreData();
    const uuid = generateUUID();
    const startDateCoreData = isoToCoreData(options.startDate);

    // First create the recurring transaction record
    const recurringUuid = generateUUID();
    const insertRecurring = this.db.prepare(`
      INSERT INTO ZRECURRINGTRANSACTION (
        Z_ENT, Z_OPT, ZPATTRIBUTES, ZPPRIORITY, ZPREMINDDAYSINADVANCE,
        ZPCREATIONTIME, ZPFIRSTUNPROCESSEDEVENTDATE, ZPMODIFICATIONDATE, ZPUNIQUEID
      ) VALUES (?, 0, 1, 0, ?, ?, ?, ?, ?)
    `);

    const recurringResult = insertRecurring.run(
      Z_ENT.RECURRING_TRANSACTION,
      options.reminderDays ?? 7,
      now,
      startDateCoreData,
      now,
      recurringUuid
    );

    const recurringId = recurringResult.lastInsertRowid as number;

    // Then create the template selector
    const sql = `
      INSERT INTO ZTEMPLATESELECTOR (
        Z_ENT, Z_OPT, ZPTRANSACTIONTEMPLATE, ZPRECURRINGTRANSACTION,
        ZPCREATIONTIME, ZPMODIFICATIONDATE, ZPSTARTDATE, ZPEXTERNALCALENDARNEXTDATE,
        ZPREPEATINTERVAL, ZPREPEATMULTIPLIER, ZPACCOUNTID,
        ZPREMINDDAYSINADVANCE, ZPUNIQUEID
      ) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = this.db.prepare(sql).run(
      Z_ENT.SCHEDULED_TEMPLATE_SELECTOR,
      options.templateId,
      recurringId,
      now,
      now,
      startDateCoreData,
      startDateCoreData,
      options.repeatInterval ?? 1,
      options.repeatMultiplier ?? 1,
      options.accountId ?? null,
      options.reminderDays ?? 7,
      uuid
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Update a scheduled transaction
   */
  updateScheduledTransaction(
    scheduleId: number,
    updates: {
      startDate?: string;
      nextDate?: string;
      repeatInterval?: number;
      repeatMultiplier?: number;
      accountId?: string;
      reminderDays?: number;
    }
  ): boolean {
    const setClauses: string[] = [];
    const params: (string | number | null)[] = [];

    if (updates.startDate !== undefined) {
      setClauses.push("ZPSTARTDATE = ?");
      params.push(isoToCoreData(updates.startDate));
    }
    if (updates.nextDate !== undefined) {
      setClauses.push("ZPEXTERNALCALENDARNEXTDATE = ?");
      params.push(isoToCoreData(updates.nextDate));
    }
    if (updates.repeatInterval !== undefined) {
      setClauses.push("ZPREPEATINTERVAL = ?");
      params.push(updates.repeatInterval);
    }
    if (updates.repeatMultiplier !== undefined) {
      setClauses.push("ZPREPEATMULTIPLIER = ?");
      params.push(updates.repeatMultiplier);
    }
    if (updates.accountId !== undefined) {
      setClauses.push("ZPACCOUNTID = ?");
      params.push(updates.accountId);
    }
    if (updates.reminderDays !== undefined) {
      setClauses.push("ZPREMINDDAYSINADVANCE = ?");
      params.push(updates.reminderDays);
    }

    if (setClauses.length === 0) return false;

    setClauses.push("ZPMODIFICATIONDATE = ?");
    params.push(nowAsCoreData());

    params.push(scheduleId);

    const sql = `UPDATE ZTEMPLATESELECTOR SET ${setClauses.join(", ")} WHERE Z_PK = ? AND Z_ENT = ${Z_ENT.SCHEDULED_TEMPLATE_SELECTOR}`;
    const result = this.db.prepare(sql).run(...params);

    return result.changes > 0;
  }

  /**
   * Delete a scheduled transaction
   */
  deleteScheduledTransaction(scheduleId: number): boolean {
    // Get the recurring transaction ID first
    const schedule = this.db.prepare(
      `SELECT ZPRECURRINGTRANSACTION as recurringId FROM ZTEMPLATESELECTOR WHERE Z_PK = ? AND Z_ENT = ?`
    ).get(scheduleId, Z_ENT.SCHEDULED_TEMPLATE_SELECTOR) as { recurringId: number | null } | undefined;

    if (!schedule) return false;

    const transaction = this.db.transaction(() => {
      // Delete the template selector
      this.db.prepare(`DELETE FROM ZTEMPLATESELECTOR WHERE Z_PK = ?`).run(scheduleId);

      // Delete the recurring transaction if it exists
      if (schedule.recurringId) {
        this.db.prepare(`DELETE FROM ZRECURRINGTRANSACTION WHERE Z_PK = ?`).run(schedule.recurringId);
      }
    });

    transaction();
    return true;
  }
}
