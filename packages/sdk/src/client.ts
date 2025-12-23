import { DatabaseConnection } from "./connection.js";
import {
  AccountRepository,
  TransactionRepository,
  LineItemRepository,
  TagRepository,
  TransactionTemplateRepository,
  ImportRuleRepository,
  ScheduledTransactionRepository,
} from "./repositories/index.js";

/**
 * Options for creating a BanktivityClient
 */
export interface BanktivityClientOptions {
  /**
   * Path to the .bank8 file
   */
  filePath: string;

  /**
   * Open database in readonly mode (default: false)
   */
  readonly?: boolean;
}

/**
 * Main client for interacting with Banktivity data
 *
 * @example
 * ```typescript
 * import { BanktivityClient } from "banktivity-sdk";
 *
 * const client = new BanktivityClient({ filePath: "/path/to/file.bank8" });
 *
 * // List accounts
 * const accounts = client.accounts.list();
 *
 * // Get account balance
 * const balance = client.accounts.getBalance(accountId);
 *
 * // Create a transaction
 * const result = client.transactions.create({
 *   title: "Coffee Shop",
 *   date: "2024-01-15",
 *   lineItems: [
 *     { accountId: 1, amount: -5.50 },
 *     { accountId: 42, amount: 5.50 }
 *   ]
 * });
 *
 * // Close connection when done
 * client.close();
 * ```
 */
export class BanktivityClient {
  private connection: DatabaseConnection;

  /**
   * Account operations
   */
  public readonly accounts: AccountRepository;

  /**
   * Transaction operations
   */
  public readonly transactions: TransactionRepository;

  /**
   * Line item operations (transaction splits)
   */
  public readonly lineItems: LineItemRepository;

  /**
   * Tag operations
   */
  public readonly tags: TagRepository;

  /**
   * Transaction template operations
   */
  public readonly templates: TransactionTemplateRepository;

  /**
   * Import rule operations
   */
  public readonly importRules: ImportRuleRepository;

  /**
   * Scheduled transaction operations
   */
  public readonly scheduledTransactions: ScheduledTransactionRepository;

  constructor(options: BanktivityClientOptions) {
    this.connection = new DatabaseConnection(
      options.filePath,
      options.readonly ?? false
    );

    // Initialize repositories
    this.lineItems = new LineItemRepository(this.connection.instance);
    this.tags = new TagRepository(this.connection.instance);
    this.templates = new TransactionTemplateRepository(this.connection.instance);
    this.importRules = new ImportRuleRepository(this.connection.instance);
    this.scheduledTransactions = new ScheduledTransactionRepository(
      this.connection.instance
    );

    // These repositories have dependencies
    this.accounts = new AccountRepository(this.connection);
    this.transactions = new TransactionRepository(this.connection, this.lineItems);
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.connection.close();
  }
}
