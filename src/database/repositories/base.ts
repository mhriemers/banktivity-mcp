import Database from "better-sqlite3";
import { nowAsCoreData } from "../../utils/date.js";
import { buildUpdateClauses } from "../../utils/sql-builder.js";

/**
 * Base repository with common CRUD patterns
 */
export abstract class BaseRepository {
  constructor(protected db: Database.Database) {}

  /**
   * Build and execute a dynamic UPDATE query
   * @param table - Table name
   * @param id - Primary key value
   * @param updates - Object with fields to update
   * @param columnMap - Mapping from update field names to SQL column names
   * @param options - Additional options
   * @returns Number of rows affected
   */
  protected executeUpdate(
    table: string,
    id: number,
    updates: object,
    columnMap: Record<string, string>,
    options: {
      idColumn?: string;
      addModificationDate?: boolean;
      incrementOpt?: boolean;
      additionalWhere?: string;
    } = {}
  ): number {
    const {
      idColumn = "Z_PK",
      addModificationDate = true,
      incrementOpt = true,
      additionalWhere,
    } = options;

    const updateClause = buildUpdateClauses(updates, columnMap);
    if (!updateClause) {
      return 0;
    }

    const setClauses = [updateClause.sql];
    const params = [...updateClause.params];

    if (addModificationDate) {
      setClauses.push("ZPMODIFICATIONDATE = ?");
      params.push(nowAsCoreData());
    }

    if (incrementOpt) {
      setClauses.push("Z_OPT = Z_OPT + 1");
    }

    params.push(id);

    let whereClause = `${idColumn} = ?`;
    if (additionalWhere) {
      whereClause += ` AND ${additionalWhere}`;
    }

    const sql = `UPDATE ${table} SET ${setClauses.join(", ")} WHERE ${whereClause}`;
    const result = this.db.prepare(sql).run(...params);

    return result.changes;
  }

  /**
   * Execute a delete and return success status
   */
  protected executeDelete(
    table: string,
    id: number,
    options: { idColumn?: string; additionalWhere?: string } = {}
  ): boolean {
    const { idColumn = "Z_PK", additionalWhere } = options;

    let whereClause = `${idColumn} = ?`;
    const params: (number | string)[] = [id];

    if (additionalWhere) {
      whereClause += ` AND ${additionalWhere}`;
    }

    const sql = `DELETE FROM ${table} WHERE ${whereClause}`;
    const result = this.db.prepare(sql).run(...params);

    return result.changes > 0;
  }

  /**
   * Wrap multiple operations in a transaction
   */
  protected runTransaction<T>(fn: () => T): T {
    const transaction = this.db.transaction(fn);
    return transaction();
  }
}
