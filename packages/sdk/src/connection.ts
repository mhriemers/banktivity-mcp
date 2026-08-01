import Database from "better-sqlite3";
import path from "path";

/**
 * Entity type numbers read from Z_PRIMARYKEY at runtime.
 *
 * These values are version-dependent — Banktivity assigns them based on
 * alphabetical ordering of entities in its Core Data model, so any added
 * or removed entity in a new version shifts subsequent numbers.
 */
export interface EntityTypes {
  Account: number;
  Category: number;
  PrimaryAccount: number;
  LineItem: number;
  LineItemTemplate: number;
  Payee: number;
  PayeeInfo: number;
  RecurringTransaction: number;
  Tag: number;
  TemplateSelector: number;
  ImportSourceTemplateSelector: number;
  ScheduledTemplateSelector: number;
  Transaction: number;
  TransactionTemplate: number;
  TransactionType: number;
  [key: string]: number;
}

/**
 * Database connection wrapper
 */
export class DatabaseConnection {
  private db: Database.Database;
  private _entityTypes: EntityTypes;

  /**
   * The tag junction table column name, derived from the Tag entity number.
   * e.g. "Z_45PTAGS" for Banktivity 7, "Z_46PTAGS" for Banktivity 8.
   */
  public readonly tagJunctionColumn: string;

  constructor(bankFilePath: string, readonly = false) {
    const dbPath = path.join(bankFilePath, "StoreContent", "core.sql");
    this.db = new Database(dbPath, { readonly });

    // Load entity type numbers from Z_PRIMARYKEY
    const rows = this.db
      .prepare(`SELECT Z_NAME, Z_ENT FROM Z_PRIMARYKEY`)
      .all() as Array<{ Z_NAME: string; Z_ENT: number }>;
    this._entityTypes = Object.fromEntries(
      rows.map((r) => [r.Z_NAME, r.Z_ENT])
    ) as EntityTypes;

    this.tagJunctionColumn = `Z_${this._entityTypes.Tag}PTAGS`;
  }

  /**
   * Get the runtime entity type numbers
   */
  get entityTypes(): EntityTypes {
    return this._entityTypes;
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
