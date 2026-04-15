import { BaseRepository } from "./base.js";
import { LineItem, UpdateLineItemInput } from "../types.js";
import { Z_ENT } from "../constants.js";
import { nowAsCoreData } from "../utils/date.js";
import { generateUUID } from "../utils/uuid.js";

/**
 * Repository for line item operations
 */
export class LineItemRepository extends BaseRepository {
  /**
   * Get line items for a transaction
   */
  getForTransaction(transactionId: number): LineItem[] {
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

  /**
   * Get a line item by ID
   */
  get(lineItemId: number): LineItem | null {
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
      WHERE li.Z_PK = ?
    `;

    const row = this.db.prepare(sql).get(lineItemId) as
      | {
          id: number;
          accountId: number;
          accountName: string;
          amount: number;
          memo: string | null;
          runningBalance: number | null;
        }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      accountId: row.accountId,
      accountName: row.accountName,
      amount: row.amount,
      memo: row.memo,
      runningBalance: row.runningBalance,
    };
  }

  /**
   * Get account ID for a line item
   */
  getAccountId(lineItemId: number): number | null {
    const sql = `SELECT ZPACCOUNT as accountId FROM ZLINEITEM WHERE Z_PK = ?`;
    const row = this.db.prepare(sql).get(lineItemId) as
      | { accountId: number }
      | undefined;
    return row?.accountId ?? null;
  }

  /**
   * Get account IDs for all line items in a transaction
   */
  getAccountIdsForTransaction(transactionId: number): number[] {
    const sql = `SELECT DISTINCT ZPACCOUNT as accountId FROM ZLINEITEM WHERE ZPTRANSACTION = ?`;
    const rows = this.db.prepare(sql).all(transactionId) as Array<{
      accountId: number;
    }>;
    return rows.map((r) => r.accountId);
  }

  /**
   * Create a new line item
   *
   * IMPORTANT: Banktivity stores a polymorphic to-one relationship to ZACCOUNT.
   * In the SQLite/Core Data backing store this is represented by TWO columns:
   *   - ZPACCOUNT  — foreign key (Z_PK of the account row)
   *   - Z1_PACCOUNT — Z_ENT of that account (the entity-class discriminator)
   *
   * Omitting Z1_PACCOUNT leaves it NULL; when Core Data later tries to
   * resolve the relationship, `_validateToOnes` / `newObjectIDForToOne` hits
   * an NSNotFound index and Banktivity crashes with NSRangeException.
   * ZPINTRADAYSORTINDEX must also be non-NULL (default 0) for sort queries.
   */
  create(
    transactionId: number,
    accountId: number,
    amount: number,
    memo?: string
  ): number {
    const now = nowAsCoreData();
    const uuid = generateUUID();

    // Look up the account's Z_ENT so we can populate Z1_PACCOUNT.
    const accountEntRow = this.db
      .prepare(`SELECT Z_ENT FROM ZACCOUNT WHERE Z_PK = ?`)
      .get(accountId) as { Z_ENT: number } | undefined;

    if (!accountEntRow) {
      throw new Error(
        `Cannot create line item: account ${accountId} not found in ZACCOUNT`
      );
    }

    const sql = `
      INSERT INTO ZLINEITEM (
        Z_ENT, Z_OPT, ZPACCOUNT, Z1_PACCOUNT, ZPTRANSACTION,
        ZPINTRADAYSORTINDEX, ZPCREATIONTIME, ZPTRANSACTIONAMOUNT,
        ZPEXCHANGERATE, ZPRUNNINGBALANCE, ZPMEMO, ZPUNIQUEID, ZPCLEARED
      ) VALUES (?, 1, ?, ?, ?, 0, ?, ?, 1.0, 0, ?, ?, 0)
    `;

    const result = this.db
      .prepare(sql)
      .run(
        Z_ENT.LINEITEM,
        accountId,
        accountEntRow.Z_ENT,
        transactionId,
        now,
        amount,
        memo ?? null,
        uuid
      );

    // Keep Core Data's Z_PRIMARYKEY.Z_MAX in sync with the actual max Z_PK.
    // Banktivity uses this to detect "known" rows; any Z_PK > Z_MAX is treated
    // as a ghost and gets purged on next save.
    const newId = result.lastInsertRowid as number;
    this.db
      .prepare(
        `UPDATE Z_PRIMARYKEY SET Z_MAX = ? WHERE Z_NAME = 'LineItem' AND Z_MAX < ?`
      )
      .run(newId, newId);

    return newId;
  }

  /**
   * Update a line item
   * @returns Set of affected account IDs for running balance recalculation
   */
  update(lineItemId: number, updates: UpdateLineItemInput): Set<number> | null {
    const currentAccountId = this.getAccountId(lineItemId);
    if (currentAccountId === null) return null;

    const affectedAccounts = new Set<number>([currentAccountId]);

    const columnMap: Record<string, string> = {
      accountId: "ZPACCOUNT",
      amount: "ZPTRANSACTIONAMOUNT",
      memo: "ZPMEMO",
    };

    const changes = this.executeUpdate("ZLINEITEM", lineItemId, updates, columnMap, {
      addModificationDate: false,
      incrementOpt: false,
    });

    if (changes === 0) return null;

    if (updates.accountId !== undefined) {
      affectedAccounts.add(updates.accountId);
    }

    return affectedAccounts;
  }

  /**
   * Delete a line item
   * @returns Account ID for running balance recalculation, or null if not found
   */
  delete(
    lineItemId: number
  ): { accountId: number; transactionId: number } | null {
    const sql = `SELECT ZPACCOUNT as accountId, ZPTRANSACTION as transactionId FROM ZLINEITEM WHERE Z_PK = ?`;
    const lineItem = this.db.prepare(sql).get(lineItemId) as
      | { accountId: number; transactionId: number }
      | undefined;

    if (!lineItem) return null;

    this.runTransaction(() => {
      this.db
        .prepare(`DELETE FROM Z_19PTAGS WHERE Z_19PLINEITEMS = ?`)
        .run(lineItemId);
      this.db.prepare(`DELETE FROM ZLINEITEM WHERE Z_PK = ?`).run(lineItemId);
    });

    return lineItem;
  }

  /**
   * Delete all line items for a transaction (including tag associations)
   */
  deleteForTransaction(transactionId: number): void {
    this.db
      .prepare(
        `
      DELETE FROM Z_19PTAGS WHERE Z_19PLINEITEMS IN (
        SELECT Z_PK FROM ZLINEITEM WHERE ZPTRANSACTION = ?
      )
    `
      )
      .run(transactionId);

    this.db
      .prepare(`DELETE FROM ZLINEITEM WHERE ZPTRANSACTION = ?`)
      .run(transactionId);
  }

  /**
   * Recalculate running balances for an account
   */
  recalculateRunningBalances(accountId: number): void {
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

    this.runTransaction(() => {
      for (const item of lineItems) {
        runningBalance += item.amount;
        updateStmt.run(runningBalance, item.id);
      }
    });
  }
}
