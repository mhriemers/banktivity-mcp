import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

/**
 * Resolve the path to the .bank8 directory, handling both the old format
 * (BANKTIVITY_FILE_PATH points directly to the .bank8 package) and the new
 * organizer format (BANKTIVITY_FILE_PATH points to an outer container that
 * holds a numbered .bank8 subdirectory, e.g. 1.bank8/).
 */
function resolveBankPath(filePath: string): string {
  const directDb = path.join(filePath, "StoreContent", "core.sql");
  if (fs.existsSync(directDb)) {
    return filePath;
  }

  // New organizer format: look for a *.bank8 subdirectory
  try {
    const entries = fs.readdirSync(filePath);
    const inner = entries.find((e) => e.endsWith(".bank8"));
    if (inner) {
      const innerPath = path.join(filePath, inner);
      const innerDb = path.join(innerPath, "StoreContent", "core.sql");
      if (fs.existsSync(innerDb)) {
        return innerPath;
      }
    }
  } catch {
    // Fall through to let Database throw a descriptive error
  }

  return filePath;
}

/**
 * Database connection wrapper
 */
export class DatabaseConnection {
  private db: Database.Database;

  constructor(bankFilePath: string, readonly = false) {
    const resolvedPath = resolveBankPath(bankFilePath);
    const dbPath = path.join(resolvedPath, "StoreContent", "core.sql");
    this.db = new Database(dbPath, { readonly });
  }

  /**
   * Get the underlying database instance
   */
  get instance(): Database.Database {
    return this.db;
  }

  /**
   * Close the database connection
   */
  close(): void {
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
