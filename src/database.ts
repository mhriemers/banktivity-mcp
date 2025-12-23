import Database from "better-sqlite3";
import path from "path";

// Core Data uses 2001-01-01 as epoch, which is 978307200 seconds after Unix epoch
const CORE_DATA_EPOCH_OFFSET = 978307200;

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

  constructor(bankFilePath: string) {
    const dbPath = path.join(bankFilePath, "StoreContent", "core.sql");
    this.db = new Database(dbPath, { readonly: true });
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
}
