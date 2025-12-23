import { BaseRepository } from "./base.js";
import {
  TransactionTemplate,
  LineItemTemplate,
  CreateTransactionTemplateInput,
  UpdateTransactionTemplateInput,
} from "../types.js";
import { Z_ENT } from "../constants.js";
import { nowAsCoreData, coreDataToISO } from "../../utils/date.js";
import { generateUUID } from "../../utils/uuid.js";

/**
 * Repository for transaction template operations
 */
export class TransactionTemplateRepository extends BaseRepository {
  /**
   * Get all transaction templates
   */
  getAll(): TransactionTemplate[] {
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

    return rows.map((row) => this.mapRowToTemplate(row));
  }

  /**
   * Get transaction template by ID
   */
  getById(templateId: number): TransactionTemplate | null {
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

    return this.mapRowToTemplate(row);
  }

  /**
   * Create a transaction template
   */
  create(input: CreateTransactionTemplateInput): number {
    const now = nowAsCoreData();
    const uuid = generateUUID();

    let templateId = 0;

    this.runTransaction(() => {
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
        input.amount,
        input.currencyId ?? null,
        input.note ?? null,
        input.title,
        uuid
      );

      templateId = result.lastInsertRowid as number;

      if (input.lineItems && input.lineItems.length > 0) {
        const insertLineItem = this.db.prepare(`
          INSERT INTO ZLINEITEMTEMPLATE (
            Z_ENT, Z_OPT, ZPFIXEDAMOUNT, ZPTRANSACTIONTEMPLATE,
            ZPCREATIONTIME, ZPTRANSACTIONAMOUNT, ZPACCOUNTID, ZPMEMO
          ) VALUES (?, 0, 1, ?, ?, ?, ?, ?)
        `);

        for (const item of input.lineItems) {
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

    return templateId;
  }

  /**
   * Update a transaction template
   */
  update(templateId: number, updates: UpdateTransactionTemplateInput): boolean {
    const columnMap: Record<string, string> = {
      title: "ZPTITLE",
      amount: "ZPAMOUNT",
      note: "ZPNOTE",
    };

    const processedUpdates: Record<string, unknown> = { ...updates };

    if (updates.active !== undefined) {
      processedUpdates.active = updates.active ? 1 : 0;
      columnMap.active = "ZPACTIVE";
    }

    const changes = this.executeUpdate("ZTRANSACTIONTEMPLATE", templateId, processedUpdates, columnMap);
    return changes > 0;
  }

  /**
   * Delete a transaction template and related items
   */
  delete(templateId: number): boolean {
    this.runTransaction(() => {
      this.db.prepare(`DELETE FROM ZLINEITEMTEMPLATE WHERE ZPTRANSACTIONTEMPLATE = ?`).run(templateId);
      this.db.prepare(`DELETE FROM ZTEMPLATESELECTOR WHERE ZPTRANSACTIONTEMPLATE = ?`).run(templateId);
      this.db.prepare(`DELETE FROM ZTRANSACTIONTEMPLATE WHERE Z_PK = ?`).run(templateId);
    });

    return true;
  }

  /**
   * Get line item templates for a template
   */
  private getLineItemTemplates(templateId: number): LineItemTemplate[] {
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
   * Map a database row to a TransactionTemplate object
   */
  private mapRowToTemplate(row: {
    id: number;
    title: string;
    amount: number;
    currencyId: string | null;
    note: string | null;
    active: number | null;
    fixedAmount: number | null;
    lastAppliedDate: number | null;
  }): TransactionTemplate {
    return {
      id: row.id,
      title: row.title,
      amount: row.amount,
      currencyId: row.currencyId,
      note: row.note,
      active: row.active === 1,
      fixedAmount: row.fixedAmount === 1,
      lastAppliedDate: row.lastAppliedDate ? coreDataToISO(row.lastAppliedDate) : null,
      lineItems: this.getLineItemTemplates(row.id),
    };
  }
}
