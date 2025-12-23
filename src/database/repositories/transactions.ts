import { BaseRepository } from "./base.js";
import { Transaction, CreateTransactionInput, UpdateTransactionInput, TransactionFilter } from "../types.js";
import { Z_ENT } from "../constants.js";
import { nowAsCoreData, coreDataToISO, isoToCoreData } from "../../utils/date.js";
import { generateUUID } from "../../utils/uuid.js";
import { DatabaseConnection } from "../connection.js";
import { LineItemRepository } from "./line-items.js";

/**
 * Repository for transaction operations
 */
export class TransactionRepository extends BaseRepository {
  private connection: DatabaseConnection;
  private lineItems: LineItemRepository;

  constructor(connection: DatabaseConnection, lineItems: LineItemRepository) {
    super(connection.instance);
    this.connection = connection;
    this.lineItems = lineItems;
  }

  /**
   * Get transactions with optional filtering
   */
  getAll(filter: TransactionFilter = {}): Transaction[] {
    const conditions: string[] = [];
    const params: (number | string)[] = [];

    if (filter.accountId) {
      conditions.push("li.ZPACCOUNT = ?");
      params.push(filter.accountId);
    }

    if (filter.startDate) {
      conditions.push("t.ZPDATE >= ?");
      params.push(isoToCoreData(filter.startDate));
    }

    if (filter.endDate) {
      conditions.push("t.ZPDATE <= ?");
      params.push(isoToCoreData(filter.endDate));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = filter.limit ? `LIMIT ${filter.limit}` : "";
    const offsetClause = filter.offset ? `OFFSET ${filter.offset}` : "";

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

    return rows.map((row) => this.mapRowToTransaction(row));
  }

  /**
   * Search transactions by title or note
   */
  search(query: string, limit = 50): Transaction[] {
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

    return rows.map((row) => this.mapRowToTransaction(row));
  }

  /**
   * Get transaction by ID
   */
  getById(transactionId: number): Transaction | null {
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

    return this.mapRowToTransaction(row);
  }

  /**
   * Get total transaction count
   */
  getCount(): number {
    const sql = `SELECT COUNT(*) as count FROM ZTRANSACTION`;
    return (this.db.prepare(sql).get() as { count: number }).count;
  }

  /**
   * Create a new transaction with line items
   */
  create(input: CreateTransactionInput): { transactionId: number; lineItemIds: number[] } {
    const now = nowAsCoreData();
    const transactionDate = isoToCoreData(input.date);
    const transactionUUID = generateUUID();
    const currencyId = this.connection.getDefaultCurrencyId();
    const transactionTypeId = input.transactionType
      ? this.connection.getTransactionTypeId(input.transactionType)
      : null;

    const result = { transactionId: 0, lineItemIds: [] as number[] };
    const affectedAccounts = new Set<number>();

    this.runTransaction(() => {
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
        input.title,
        input.note ?? null,
        transactionUUID
      );

      result.transactionId = txResult.lastInsertRowid as number;

      for (const item of input.lineItems) {
        const lineItemId = this.lineItems.create(
          result.transactionId,
          item.accountId,
          item.amount,
          item.memo
        );
        result.lineItemIds.push(lineItemId);
        affectedAccounts.add(item.accountId);
      }
    });

    for (const accountId of affectedAccounts) {
      this.lineItems.recalculateRunningBalances(accountId);
    }

    return result;
  }

  /**
   * Update a transaction
   */
  update(transactionId: number, updates: UpdateTransactionInput): boolean {
    const columnMap: Record<string, string> = {
      title: "ZPTITLE",
      note: "ZPNOTE",
    };

    const processedUpdates: Record<string, unknown> = { ...updates };

    if (updates.date !== undefined) {
      processedUpdates.date = isoToCoreData(updates.date);
      columnMap.date = "ZPDATE";
    }

    if (updates.cleared !== undefined) {
      processedUpdates.cleared = updates.cleared ? 1 : 0;
      columnMap.cleared = "ZPCLEARED";
    }

    const changes = this.executeUpdate("ZTRANSACTION", transactionId, processedUpdates, columnMap);

    if (changes > 0 && updates.date !== undefined) {
      const accountIds = this.lineItems.getAccountIdsForTransaction(transactionId);
      for (const accountId of accountIds) {
        this.lineItems.recalculateRunningBalances(accountId);
      }
    }

    return changes > 0;
  }

  /**
   * Delete a transaction and its line items
   */
  delete(transactionId: number): boolean {
    const affectedAccounts = this.lineItems.getAccountIdsForTransaction(transactionId);

    this.runTransaction(() => {
      this.lineItems.deleteForTransaction(transactionId);
      this.db.prepare(`DELETE FROM ZTRANSACTION WHERE Z_PK = ?`).run(transactionId);
    });

    for (const accountId of affectedAccounts) {
      this.lineItems.recalculateRunningBalances(accountId);
    }

    return true;
  }

  /**
   * Mark transactions as cleared/reconciled
   */
  reconcile(transactionIds: number[], cleared = true): number {
    const now = nowAsCoreData();
    const sql = `
      UPDATE ZTRANSACTION
      SET ZPCLEARED = ?, ZPMODIFICATIONDATE = ?, Z_OPT = Z_OPT + 1
      WHERE Z_PK = ?
    `;
    const stmt = this.db.prepare(sql);

    let updated = 0;
    this.runTransaction(() => {
      for (const id of transactionIds) {
        const result = stmt.run(cleared ? 1 : 0, now, id);
        updated += result.changes;
      }
    });

    return updated;
  }

  /**
   * Map a database row to a Transaction object
   */
  private mapRowToTransaction(row: {
    id: number;
    date: number;
    title: string;
    note: string | null;
    cleared: number;
    voided: number;
    transactionType: string | null;
  }): Transaction {
    return {
      id: row.id,
      date: coreDataToISO(row.date),
      title: row.title,
      note: row.note,
      cleared: row.cleared === 1,
      voided: row.voided === 1,
      transactionType: row.transactionType,
      lineItems: this.lineItems.getForTransaction(row.id),
    };
  }
}
