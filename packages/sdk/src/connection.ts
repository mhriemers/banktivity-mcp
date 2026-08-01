import Database from "better-sqlite3";
import path from "path";

/**
 * Database connection wrapper
 */
export class DatabaseConnection {
  private db: Database.Database;

  constructor(bankFilePath: string, readonly = false) {
    const dbPath = path.join(bankFilePath, "StoreContent", "core.sql");
    this.db = new Database(dbPath, { readonly });
  }

  /**
   * Get the underlying database instance
   */
  get instance(): Database.Database {
    return this.db;
  }

  /**
   * Close the database connection.
   *
   * Runs a WAL checkpoint first so that all writes are merged into the main
   * database file and the -wal sidecar is truncated. Without this, Banktivity
   * may not see the changes (or may refuse to open the file) if it reads the
   * database before the WAL is replayed.
   */
  close(): void {
    this.db.pragma('wal_checkpoint(TRUNCATE)');
    this.db.close();
  }

  /**
   * Get the default currency ID (first currency in database)
   */
  getDefaultCurrencyId(): number | null {
    const sql = `SELECT Z_PK as id FROM ZCURRENCY LIMIT 1`;
    const row = this.db.prepare(sql).get() as { id: number } | undefined;
    return row?.id ?? null;
  }

  /**
   * Get currency ID by code
   */
  getCurrencyIdByCode(code: string): number | null {
    const sql = `SELECT Z_PK as id FROM ZCURRENCY WHERE ZPCODE = ?`;
    const row = this.db.prepare(sql).get(code) as { id: number } | undefined;
    return row?.id ?? null;
  }

  /**
   * Get transaction type ID by name
   */
  getTransactionTypeId(typeName: string): number | null {
    const sql = `SELECT Z_PK as id FROM ZTRANSACTIONTYPE WHERE ZPNAME = ? OR ZPSHORTNAME = ?`;
    const row = this.db.prepare(sql).get(typeName, typeName) as { id: number } | undefined;
    return row?.id ?? null;
  }
}
