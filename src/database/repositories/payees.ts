import { BaseRepository } from "./base.js";
import { Payee, CreatePayeeInput, UpdatePayeeInput } from "../types.js";
import { Z_ENT } from "../constants.js";

/**
 * Repository for payee operations
 */
export class PayeeRepository extends BaseRepository {
  /**
   * Get all payees
   */
  getAll(): Payee[] {
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

    return this.db.prepare(sql).all() as Payee[];
  }

  /**
   * Get payee by ID
   */
  getById(payeeId: number): Payee | null {
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
  create(input: CreatePayeeInput): number {
    let payeeId = 0;

    this.runTransaction(() => {
      const insertPayeeInfo = this.db.prepare(`
        INSERT INTO ZPAYEEINFO (
          Z_ENT, Z_OPT, ZPNAME, ZPPHONE, ZPSTREET1, ZPSTREET2, ZPSTREET3,
          ZPCITY, ZPSTATE, ZPPOSTALCODE, ZPCOUNTRYCODE
        ) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const payeeInfoResult = insertPayeeInfo.run(
        Z_ENT.PAYEE_INFO,
        input.name,
        input.phone ?? null,
        input.street1 ?? null,
        input.street2 ?? null,
        input.street3 ?? null,
        input.city ?? null,
        input.state ?? null,
        input.postalCode ?? null,
        input.countryCode ?? null
      );

      const payeeInfoId = payeeInfoResult.lastInsertRowid as number;

      const insertPayee = this.db.prepare(`
        INSERT INTO ZPAYEE (Z_ENT, Z_OPT, ZPPAYEEINFO)
        VALUES (?, 0, ?)
      `);

      const payeeResult = insertPayee.run(Z_ENT.PAYEE, payeeInfoId);
      payeeId = payeeResult.lastInsertRowid as number;
    });

    return payeeId;
  }

  /**
   * Update a payee
   */
  update(payeeId: number, updates: UpdatePayeeInput): boolean {
    const payee = this.db.prepare(
      `SELECT ZPPAYEEINFO as payeeInfoId FROM ZPAYEE WHERE Z_PK = ?`
    ).get(payeeId) as { payeeInfoId: number } | undefined;

    if (!payee) return false;

    const columnMap: Record<string, string> = {
      name: "ZPNAME",
      phone: "ZPPHONE",
      street1: "ZPSTREET1",
      street2: "ZPSTREET2",
      street3: "ZPSTREET3",
      city: "ZPCITY",
      state: "ZPSTATE",
      postalCode: "ZPPOSTALCODE",
      countryCode: "ZPCOUNTRYCODE",
    };

    const changes = this.executeUpdate("ZPAYEEINFO", payee.payeeInfoId, updates, columnMap, {
      addModificationDate: false,
      incrementOpt: false,
    });

    return changes > 0;
  }

  /**
   * Delete a payee
   */
  delete(payeeId: number): boolean {
    const payee = this.db.prepare(
      `SELECT ZPPAYEEINFO as payeeInfoId FROM ZPAYEE WHERE Z_PK = ?`
    ).get(payeeId) as { payeeInfoId: number } | undefined;

    if (!payee) return false;

    this.runTransaction(() => {
      this.db.prepare(`DELETE FROM ZPAYEE WHERE Z_PK = ?`).run(payeeId);
      this.db.prepare(`DELETE FROM ZPAYEEINFO WHERE Z_PK = ?`).run(payee.payeeInfoId);
    });

    return true;
  }
}
