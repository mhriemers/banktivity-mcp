import Database from "better-sqlite3";
import path from "path";
import { randomUUID } from "crypto";

// Core Data uses 2001-01-01 as epoch, which is 978307200 seconds after Unix epoch
const CORE_DATA_EPOCH_OFFSET = 978307200;

// Core Data entity type constants (Z_ENT values)
const Z_ENT = {
  ACCOUNT: 1,
  LINEITEM: 19,
  TAG: 47,
  TRANSACTION: 53,
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

    const sql = `
      INSERT INTO ZACCOUNT (
        Z_ENT, Z_OPT, ZPACCOUNTCLASS, ZPDEBIT, ZPHIDDEN, ZPTAXABLE,
        ZCURRENCY, ZPCREATIONTIME, ZPMODIFICATIONDATE,
        ZPNAME, ZPFULLNAME, ZPUNIQUEID
      ) VALUES (?, 0, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
    `;

    const result = this.db.prepare(sql).run(
      Z_ENT.ACCOUNT,
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
    const canonicalName = name.toLowerCase().trim();

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
    const canonicalName = name.toLowerCase().trim();
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
}
