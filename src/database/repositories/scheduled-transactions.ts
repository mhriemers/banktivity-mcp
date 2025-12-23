import { BaseRepository } from "./base.js";
import {
  ScheduledTransaction,
  CreateScheduledTransactionInput,
  UpdateScheduledTransactionInput,
} from "../types.js";
import { Z_ENT } from "../constants.js";
import { nowAsCoreData, coreDataToISO, isoToCoreData } from "../../utils/date.js";
import { generateUUID } from "../../utils/uuid.js";

/**
 * Repository for scheduled transaction operations
 */
export class ScheduledTransactionRepository extends BaseRepository {
  /**
   * Get all scheduled transactions
   */
  getAll(): ScheduledTransaction[] {
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

    return rows.map((row) => this.mapRowToSchedule(row));
  }

  /**
   * Get scheduled transaction by ID
   */
  getById(scheduleId: number): ScheduledTransaction | null {
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

    return this.mapRowToSchedule(row);
  }

  /**
   * Create a scheduled transaction
   */
  create(input: CreateScheduledTransactionInput): number {
    const now = nowAsCoreData();
    const uuid = generateUUID();
    const startDateCoreData = isoToCoreData(input.startDate);

    const recurringUuid = generateUUID();
    const insertRecurring = this.db.prepare(`
      INSERT INTO ZRECURRINGTRANSACTION (
        Z_ENT, Z_OPT, ZPATTRIBUTES, ZPPRIORITY, ZPREMINDDAYSINADVANCE,
        ZPCREATIONTIME, ZPFIRSTUNPROCESSEDEVENTDATE, ZPMODIFICATIONDATE, ZPUNIQUEID
      ) VALUES (?, 0, 1, 0, ?, ?, ?, ?, ?)
    `);

    const recurringResult = insertRecurring.run(
      Z_ENT.RECURRING_TRANSACTION,
      input.reminderDays ?? 7,
      now,
      startDateCoreData,
      now,
      recurringUuid
    );

    const recurringId = recurringResult.lastInsertRowid as number;

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
      input.templateId,
      recurringId,
      now,
      now,
      startDateCoreData,
      startDateCoreData,
      input.repeatInterval ?? 1,
      input.repeatMultiplier ?? 1,
      input.accountId ?? null,
      input.reminderDays ?? 7,
      uuid
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Update a scheduled transaction
   */
  update(scheduleId: number, updates: UpdateScheduledTransactionInput): boolean {
    const columnMap: Record<string, string> = {
      repeatInterval: "ZPREPEATINTERVAL",
      repeatMultiplier: "ZPREPEATMULTIPLIER",
      accountId: "ZPACCOUNTID",
      reminderDays: "ZPREMINDDAYSINADVANCE",
    };

    const processedUpdates: Record<string, unknown> = { ...updates };

    if (updates.startDate !== undefined) {
      processedUpdates.startDate = isoToCoreData(updates.startDate);
      columnMap.startDate = "ZPSTARTDATE";
    }

    if (updates.nextDate !== undefined) {
      processedUpdates.nextDate = isoToCoreData(updates.nextDate);
      columnMap.nextDate = "ZPEXTERNALCALENDARNEXTDATE";
    }

    const changes = this.executeUpdate("ZTEMPLATESELECTOR", scheduleId, processedUpdates, columnMap, {
      additionalWhere: `Z_ENT = ${Z_ENT.SCHEDULED_TEMPLATE_SELECTOR}`,
    });

    return changes > 0;
  }

  /**
   * Delete a scheduled transaction
   */
  delete(scheduleId: number): boolean {
    const schedule = this.db.prepare(
      `SELECT ZPRECURRINGTRANSACTION as recurringId FROM ZTEMPLATESELECTOR WHERE Z_PK = ? AND Z_ENT = ?`
    ).get(scheduleId, Z_ENT.SCHEDULED_TEMPLATE_SELECTOR) as { recurringId: number | null } | undefined;

    if (!schedule) return false;

    this.runTransaction(() => {
      this.db.prepare(`DELETE FROM ZTEMPLATESELECTOR WHERE Z_PK = ?`).run(scheduleId);

      if (schedule.recurringId) {
        this.db.prepare(`DELETE FROM ZRECURRINGTRANSACTION WHERE Z_PK = ?`).run(schedule.recurringId);
      }
    });

    return true;
  }

  /**
   * Map a database row to a ScheduledTransaction object
   */
  private mapRowToSchedule(row: {
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
  }): ScheduledTransaction {
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
}
