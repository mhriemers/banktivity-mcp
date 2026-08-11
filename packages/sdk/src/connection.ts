import Database from "better-sqlite3";
import path from "path";
import { readFileSync } from "node:fs";
import { CurrencyMetadataError } from "./errors.js";

/**
 * Database connection wrapper
 */
export class DatabaseConnection {
  private db: Database.Database;
  private bankFilePath: string;

  constructor(bankFilePath: string, readonly = false) {
    this.bankFilePath = bankFilePath;
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
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Get the database's configured home currency ID.
   *
   * Currency metadata is authoritative and required. This method deliberately
   * does not guess from ZCURRENCY row order when the bank package is invalid.
   */
  getDefaultCurrencyId(): number {
    const attributesPath = path.join(this.bankFilePath, "StoreAttributes.plist");
    let attributes: string;

    try {
      attributes = readFileSync(attributesPath, "utf8");
    } catch (error) {
      const reason = error instanceof Error ? `: ${error.message}` : "";
      throw new CurrencyMetadataError(
        `Unable to read StoreAttributes.plist at ${attributesPath}${reason}`
      );
    }

    const match = attributes.match(
      /<key>(?:homeCurrency|displayCurrencyCode)<\/key>\s*<string>([^<]+)<\/string>/
    );
    const currencyCode = match?.[1]?.trim();
    if (!currencyCode) {
      throw new CurrencyMetadataError(
        "StoreAttributes.plist does not contain a supported home currency code"
      );
    }

    const sql = `SELECT Z_PK as id FROM ZCURRENCY WHERE ZPCODE = ?`;
    const row = this.db.prepare(sql).get(currencyCode) as
      | { id: number }
      | undefined;
    if (!row) {
      throw new CurrencyMetadataError(
        `Configured currency ${currencyCode} was not found in ZCURRENCY`
      );
    }

    return row.id;
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
