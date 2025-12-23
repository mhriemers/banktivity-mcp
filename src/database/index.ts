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

// Re-export types
export * from "./types.js";
export * from "./constants.js";

/**
 * Main database facade providing access to all repositories
 */
export class BanktivityDatabase {
  private connection: DatabaseConnection;

  public readonly accounts: AccountRepository;
  public readonly transactions: TransactionRepository;
  public readonly lineItems: LineItemRepository;
  public readonly tags: TagRepository;
  public readonly templates: TransactionTemplateRepository;
  public readonly importRules: ImportRuleRepository;
  public readonly scheduledTransactions: ScheduledTransactionRepository;

  constructor(bankFilePath: string, readonly = false) {
    this.connection = new DatabaseConnection(bankFilePath, readonly);

    // Initialize repositories
    this.lineItems = new LineItemRepository(this.connection.instance);
    this.tags = new TagRepository(this.connection.instance);
    this.templates = new TransactionTemplateRepository(this.connection.instance);
    this.importRules = new ImportRuleRepository(this.connection.instance);
    this.scheduledTransactions = new ScheduledTransactionRepository(this.connection.instance);

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

  // ============================================
  // Convenience methods for backward compatibility
  // ============================================

  getAccounts(includeHidden = false) {
    return this.accounts.getAll(includeHidden);
  }

  getAccountById(accountId: number) {
    return this.accounts.getById(accountId);
  }

  getAccountBalance(accountId: number) {
    return this.accounts.getBalance(accountId);
  }

  getTransactions(options: Parameters<TransactionRepository["getAll"]>[0] = {}) {
    return this.transactions.getAll(options);
  }

  getTransactionById(transactionId: number) {
    return this.transactions.getById(transactionId);
  }

  searchTransactions(query: string, limit = 50) {
    return this.transactions.search(query, limit);
  }

  getTransactionCount() {
    return this.transactions.getCount();
  }

  createTransaction(options: Parameters<TransactionRepository["create"]>[0]) {
    return this.transactions.create(options);
  }

  updateTransaction(transactionId: number, updates: Parameters<TransactionRepository["update"]>[1]) {
    return this.transactions.update(transactionId, updates);
  }

  deleteTransaction(transactionId: number) {
    return this.transactions.delete(transactionId);
  }

  reconcileTransactions(transactionIds: number[], cleared = true) {
    return this.transactions.reconcile(transactionIds, cleared);
  }

  getLineItemById(lineItemId: number) {
    return this.lineItems.getById(lineItemId);
  }

  updateLineItem(lineItemId: number, updates: Parameters<LineItemRepository["update"]>[1]) {
    const affectedAccounts = this.lineItems.update(lineItemId, updates);
    if (affectedAccounts) {
      for (const accountId of affectedAccounts) {
        this.lineItems.recalculateRunningBalances(accountId);
      }
      return true;
    }
    return false;
  }

  deleteLineItem(lineItemId: number) {
    const result = this.lineItems.delete(lineItemId);
    if (result) {
      this.lineItems.recalculateRunningBalances(result.accountId);
      return true;
    }
    return false;
  }

  addLineItemToTransaction(
    transactionId: number,
    options: { accountId: number; amount: number; memo?: string }
  ) {
    const lineItemId = this.lineItems.create(transactionId, options.accountId, options.amount, options.memo);
    this.lineItems.recalculateRunningBalances(options.accountId);
    return lineItemId;
  }

  createAccount(options: Parameters<AccountRepository["create"]>[0]) {
    return this.accounts.create(options);
  }

  getSpendingByCategory(options: { startDate?: string; endDate?: string } = {}) {
    return this.accounts.getCategoryAnalysis("expense", options);
  }

  getIncomeByCategory(options: { startDate?: string; endDate?: string } = {}) {
    return this.accounts.getCategoryAnalysis("income", options);
  }

  getNetWorth() {
    return this.accounts.getNetWorth();
  }

  getTags() {
    return this.tags.getAll();
  }

  getTagByName(name: string) {
    return this.tags.getByName(name);
  }

  createTag(name: string) {
    return this.tags.create(name);
  }

  tagTransaction(transactionId: number, tagId: number) {
    return this.tags.tagTransaction(transactionId, tagId);
  }

  untagTransaction(transactionId: number, tagId: number) {
    return this.tags.untagTransaction(transactionId, tagId);
  }

  getTransactionTemplates() {
    return this.templates.getAll();
  }

  getTransactionTemplateById(templateId: number) {
    return this.templates.getById(templateId);
  }

  createTransactionTemplate(options: Parameters<TransactionTemplateRepository["create"]>[0]) {
    return this.templates.create(options);
  }

  updateTransactionTemplate(templateId: number, updates: Parameters<TransactionTemplateRepository["update"]>[1]) {
    return this.templates.update(templateId, updates);
  }

  deleteTransactionTemplate(templateId: number) {
    return this.templates.delete(templateId);
  }

  getImportRules() {
    return this.importRules.getAll();
  }

  getImportRuleById(ruleId: number) {
    return this.importRules.getById(ruleId);
  }

  createImportRule(options: Parameters<ImportRuleRepository["create"]>[0]) {
    return this.importRules.create(options);
  }

  updateImportRule(ruleId: number, updates: Parameters<ImportRuleRepository["update"]>[1]) {
    return this.importRules.update(ruleId, updates);
  }

  deleteImportRule(ruleId: number) {
    return this.importRules.delete(ruleId);
  }

  matchImportRules(description: string) {
    return this.importRules.matchDescription(description);
  }

  getScheduledTransactions() {
    return this.scheduledTransactions.getAll();
  }

  getScheduledTransactionById(scheduleId: number) {
    return this.scheduledTransactions.getById(scheduleId);
  }

  createScheduledTransaction(options: Parameters<ScheduledTransactionRepository["create"]>[0]) {
    return this.scheduledTransactions.create(options);
  }

  updateScheduledTransaction(scheduleId: number, updates: Parameters<ScheduledTransactionRepository["update"]>[1]) {
    return this.scheduledTransactions.update(scheduleId, updates);
  }

  deleteScheduledTransaction(scheduleId: number) {
    return this.scheduledTransactions.delete(scheduleId);
  }
}
