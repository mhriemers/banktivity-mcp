/**
 * Shared database types and interfaces
 */

export interface Account {
  id: number;
  name: string;
  fullName: string;
  accountClass: number;
  accountType: string;
  hidden: boolean;
  currency: string | null;
}

export interface Transaction {
  id: number;
  date: string;
  title: string;
  note: string | null;
  cleared: boolean;
  voided: boolean;
  transactionType: string | null;
  lineItems: LineItem[];
}

export interface LineItem {
  id: number;
  accountId: number;
  accountName: string;
  amount: number;
  memo: string | null;
  runningBalance: number | null;
}

export interface CategorySpending {
  category: string;
  total: number;
  transactionCount: number;
}

export interface NetWorth {
  assets: number;
  liabilities: number;
  netWorth: number;
}

export interface Tag {
  id: number;
  name: string;
}

export interface TransactionTemplate {
  id: number;
  title: string;
  amount: number;
  currencyId: string | null;
  note: string | null;
  active: boolean;
  fixedAmount: boolean;
  lastAppliedDate: string | null;
  lineItems: LineItemTemplate[];
}

export interface LineItemTemplate {
  id: number;
  accountId: string;
  accountName: string | null;
  amount: number;
  memo: string | null;
  fixedAmount: boolean;
}

export interface ImportRule {
  id: number;
  templateId: number;
  templateTitle: string;
  pattern: string;
  accountId: string | null;
  payee: string | null;
}

export interface ScheduledTransaction {
  id: number;
  templateId: number;
  templateTitle: string;
  amount: number;
  startDate: string | null;
  nextDate: string | null;
  repeatInterval: number | null;
  repeatMultiplier: number | null;
  accountId: string | null;
  reminderDays: number | null;
  recurringTransactionId: number | null;
}

// Input types for create/update operations

export interface CreateTransactionInput {
  title: string;
  date: string;
  note?: string;
  transactionType?: string;
  lineItems: CreateLineItemInput[];
}

export interface CreateLineItemInput {
  accountId: number;
  amount: number;
  memo?: string;
}

export interface UpdateTransactionInput {
  title?: string;
  date?: string;
  note?: string;
  cleared?: boolean;
}

export interface UpdateLineItemInput {
  accountId?: number;
  amount?: number;
  memo?: string;
}

export interface CreateAccountInput {
  name: string;
  fullName?: string;
  accountClass: number;
  currencyCode?: string;
  hidden?: boolean;
}

export interface CreateTransactionTemplateInput {
  title: string;
  amount: number;
  note?: string;
  currencyId?: string;
  lineItems?: Array<{
    accountId: string;
    amount: number;
    memo?: string;
  }>;
}

export interface UpdateTransactionTemplateInput {
  title?: string;
  amount?: number;
  note?: string;
  active?: boolean;
}

export interface CreateImportRuleInput {
  templateId: number;
  pattern: string;
  accountId?: string;
  payee?: string;
}

export interface UpdateImportRuleInput {
  pattern?: string;
  accountId?: string;
  payee?: string;
}

export interface CreateScheduledTransactionInput {
  templateId: number;
  startDate: string;
  accountId?: string;
  repeatInterval?: number;
  repeatMultiplier?: number;
  reminderDays?: number;
}

export interface UpdateScheduledTransactionInput {
  startDate?: string;
  nextDate?: string;
  repeatInterval?: number;
  repeatMultiplier?: number;
  accountId?: string;
  reminderDays?: number;
}

export interface DateRangeFilter {
  startDate?: string;
  endDate?: string;
}

export interface TransactionFilter extends DateRangeFilter {
  accountId?: number;
  limit?: number;
  offset?: number;
}
