/**
 * Core Data entity type constants (Z_ENT values)
 */
export const Z_ENT = {
  ACCOUNT: 1,
  CATEGORY: 2,
  PRIMARY_ACCOUNT: 3,
  LINEITEM: 19,
  LINEITEM_TEMPLATE: 21,
  PAYEE: 31,
  PAYEE_INFO: 33,
  RECURRING_TRANSACTION: 35,
  TAG: 47,
  TEMPLATE_SELECTOR: 48,
  IMPORT_SOURCE_TEMPLATE_SELECTOR: 49,
  SCHEDULED_TEMPLATE_SELECTOR: 52,
  TRANSACTION: 53,
  TRANSACTION_TEMPLATE: 54,
  TRANSACTION_TYPE: 55,
} as const;

/**
 * Account class constants
 */
export const ACCOUNT_CLASS = {
  SAVINGS: 1002,
  CHECKING: 1006,
  CREDIT_CARD: 5001,
  INCOME: 6000,
  EXPENSE: 7000,
} as const;

/**
 * Account class display names
 */
export const ACCOUNT_CLASS_NAMES: Record<number, string> = {
  [ACCOUNT_CLASS.SAVINGS]: "Savings/Investment",
  [ACCOUNT_CLASS.CHECKING]: "Checking",
  [ACCOUNT_CLASS.CREDIT_CARD]: "Credit Card",
  [ACCOUNT_CLASS.INCOME]: "Income",
  [ACCOUNT_CLASS.EXPENSE]: "Expense",
};

/**
 * Get account type display name from account class
 */
export function getAccountTypeName(accountClass: number): string {
  return ACCOUNT_CLASS_NAMES[accountClass] || `Unknown (${accountClass})`;
}
