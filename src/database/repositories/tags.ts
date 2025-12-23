import { BaseRepository } from "./base.js";
import { Tag } from "../types.js";
import { Z_ENT } from "../constants.js";
import { nowAsCoreData } from "../../utils/date.js";
import { generateUUID } from "../../utils/uuid.js";

/**
 * Repository for tag operations
 */
export class TagRepository extends BaseRepository {
  /**
   * Get all tags
   */
  getAll(): Tag[] {
    const sql = `SELECT Z_PK as id, ZPNAME as name FROM ZTAG ORDER BY ZPNAME`;
    return this.db.prepare(sql).all() as Tag[];
  }

  /**
   * Get tag by name (case-insensitive)
   */
  getByName(name: string): Tag | null {
    const canonicalName = name.toUpperCase().trim();
    const sql = `SELECT Z_PK as id, ZPNAME as name FROM ZTAG WHERE ZPCANONICALNAME = ?`;
    const row = this.db.prepare(sql).get(canonicalName) as Tag | undefined;
    return row ?? null;
  }

  /**
   * Create a new tag (or return existing if name matches)
   */
  create(name: string): number {
    const canonicalName = name.toUpperCase().trim();

    const existing = this.db.prepare(
      `SELECT Z_PK as id FROM ZTAG WHERE ZPCANONICALNAME = ?`
    ).get(canonicalName) as { id: number } | undefined;

    if (existing) {
      return existing.id;
    }

    const now = nowAsCoreData();
    const uuid = generateUUID();

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
  addToLineItem(lineItemId: number, tagId: number): boolean {
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
  removeFromLineItem(lineItemId: number, tagId: number): boolean {
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
      if (this.addToLineItem(item.id, tagId)) {
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
      if (this.removeFromLineItem(item.id, tagId)) {
        removed++;
      }
    }
    return removed;
  }
}
