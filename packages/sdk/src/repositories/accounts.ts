import { BaseRepository } from "./base.js";
import {
  Account,
  CreateAccountInput,
  CategorySpending,
  NetWorth,
  DateRangeFilter,
  ListAccountsOptions,
} from "../types.js";
import { Z_ENT, ACCOUNT_CLASS, getAccountTypeName } from "../constants.js";
import { nowAsCoreData, isoToCoreData } from "../utils/date.js";
import { generateUUID } from "../utils/uuid.js";
import { DatabaseConnection } from "../connection.js";

/**
 * Repository for account operations
 */
export class AccountRepository extends BaseRepository {
  private connection: DatabaseConnection;

  constructor(connection: DatabaseConnection) {
    super(connection.instance);
    this.connection = connection;
  }

  /**
   * List all accounts
   */
  list(options: ListAccountsOptions = {}): Account[] {
    const { includeHidden = false } = options;

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
      accountType: getAccountTypeName(row.accountClass),
      hidden: row.hidden === 1,
      currency: row.currency,
    }));
  }

  /**
   * Get account by ID
   */
  get(accountId: number): Account | null {
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
      accountType: getAccountTypeName(row.accountClass),
      hidden: row.hidden === 1,
      currency: row.currency,
    };
  }

  /**
   * Find account by name (case-insensitive)
   */
  findByName(name: string): Account | null {
    const accounts = this.list({ includeHidden: true });
    const lowerName = name.toLowerCase();
    return (
      accounts.find(
        (a) =>
          a.name.toLowerCase() === lowerName ||
          a.fullName.toLowerCase() === lowerName
      ) ?? null
    );
  }

  /**
   * Get account balance
   */
  getBalance(accountId: number): number {
    const sql = `
      SELECT COALESCE(SUM(ZPTRANSACTIONAMOUNT), 0) as balance
      FROM ZLINEITEM
      WHERE ZPACCOUNT = ?
    `;
    const row = this.db.prepare(sql).get(accountId) as { balance: number };
    return row.balance;
  }

  /**
   * Create a new account
   */
  create(input: CreateAccountInput): number {
    const now = nowAsCoreData();
    const uuid = generateUUID();

    let currencyId: number | null = null;
    if (input.currencyCode) {
      currencyId = this.connection.getCurrencyIdByCode(input.currencyCode);
    }
    if (!currencyId) {
      currencyId = this.connection.getDefaultCurrencyId();
    }

    const isDebit = input.accountClass !== ACCOUNT_CLASS.CREDIT_CARD;
    const isCategory =
      input.accountClass === ACCOUNT_CLASS.INCOME ||
      input.accountClass === ACCOUNT_CLASS.EXPENSE;
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
      input.accountClass,
      isDebit ? 1 : 0,
      input.hidden ? 1 : 0,
      currencyId,
      now,
      now,
      input.name,
      input.fullName ?? input.name,
      uuid
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get spending or income by category
   */
  getCategoryAnalysis(
    type: "income" | "expense",
    filter: DateRangeFilter = {}
  ): CategorySpending[] {
    const accountClass =
      type === "income" ? ACCOUNT_CLASS.INCOME : ACCOUNT_CLASS.EXPENSE;
    const conditions: string[] = [`a.ZPACCOUNTCLASS = ${accountClass}`];
    const params: number[] = [];

    if (filter.startDate) {
      conditions.push("t.ZPDATE >= ?");
      params.push(isoToCoreData(filter.startDate));
    }

    if (filter.endDate) {
      conditions.push("t.ZPDATE <= ?");
      params.push(isoToCoreData(filter.endDate));
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

    return this.db.prepare(sql).all(...params) as CategorySpending[];
  }

  /**
   * Calculate net worth
   */
  getNetWorth(): NetWorth {
    const assetsSql = `
      SELECT COALESCE(SUM(li.ZPTRANSACTIONAMOUNT), 0) as total
      FROM ZLINEITEM li
      JOIN ZACCOUNT a ON li.ZPACCOUNT = a.Z_PK
      WHERE a.ZPACCOUNTCLASS IN (${ACCOUNT_CLASS.SAVINGS}, ${ACCOUNT_CLASS.CHECKING})
    `;

    const liabilitiesSql = `
      SELECT COALESCE(SUM(li.ZPTRANSACTIONAMOUNT), 0) as total
      FROM ZLINEITEM li
      JOIN ZACCOUNT a ON li.ZPACCOUNT = a.Z_PK
      WHERE a.ZPACCOUNTCLASS = ${ACCOUNT_CLASS.CREDIT_CARD}
    `;

    const assets = (this.db.prepare(assetsSql).get() as { total: number }).total;
    const liabilities = (
      this.db.prepare(liabilitiesSql).get() as { total: number }
    ).total;

    return {
      assets,
      liabilities,
      netWorth: assets + liabilities,
    };
  }
}
