import { BaseRepository } from "./base.js";
import {
  ImportRule,
  CreateImportRuleInput,
  UpdateImportRuleInput,
} from "../types.js";
import { Z_ENT } from "../constants.js";
import { nowAsCoreData } from "../utils/date.js";
import { generateUUID } from "../utils/uuid.js";

/**
 * Repository for import rule operations
 */
export class ImportRuleRepository extends BaseRepository {
  /**
   * List all import rules
   */
  list(): ImportRule[] {
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

    return this.db
      .prepare(sql)
      .all(Z_ENT.IMPORT_SOURCE_TEMPLATE_SELECTOR) as ImportRule[];
  }

  /**
   * Get import rule by ID
   */
  get(ruleId: number): ImportRule | null {
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

    const row = this.db
      .prepare(sql)
      .get(ruleId, Z_ENT.IMPORT_SOURCE_TEMPLATE_SELECTOR) as
      | ImportRule
      | undefined;
    return row ?? null;
  }

  /**
   * Create an import rule
   */
  create(input: CreateImportRuleInput): number {
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
      input.templateId,
      now,
      now,
      input.pattern,
      input.accountId ?? null,
      input.payee ?? null,
      uuid
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Update an import rule
   */
  update(ruleId: number, updates: UpdateImportRuleInput): boolean {
    const columnMap: Record<string, string> = {
      pattern: "ZPDETAILSEXPRESSION",
      accountId: "ZPACCOUNTID",
      payee: "ZPPAYEE",
    };

    const changes = this.executeUpdate("ZTEMPLATESELECTOR", ruleId, updates, columnMap, {
      additionalWhere: `Z_ENT = ${Z_ENT.IMPORT_SOURCE_TEMPLATE_SELECTOR}`,
    });

    return changes > 0;
  }

  /**
   * Delete an import rule
   */
  delete(ruleId: number): boolean {
    const sql = `DELETE FROM ZTEMPLATESELECTOR WHERE Z_PK = ? AND Z_ENT = ?`;
    const result = this.db
      .prepare(sql)
      .run(ruleId, Z_ENT.IMPORT_SOURCE_TEMPLATE_SELECTOR);
    return result.changes > 0;
  }

  /**
   * Match a transaction description against import rules
   */
  match(description: string): ImportRule[] {
    const rules = this.list();
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
}
