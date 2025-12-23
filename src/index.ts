#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BanktivityDatabase } from "./database.js";

const BANK_FILE_PATH = process.env.BANKTIVITY_FILE_PATH;

if (!BANK_FILE_PATH) {
  console.error("Error: BANKTIVITY_FILE_PATH environment variable is required");
  console.error("Set it to the path of your .bank8 file");
  process.exit(1);
}

const db = new BanktivityDatabase(BANK_FILE_PATH);

const server = new McpServer({
  name: "banktivity-mcp",
  version: "1.0.0",
});

// Helper functions
function findAccountByName(name: string): number | null {
  const accounts = db.getAccounts(true);
  const account = accounts.find(
    (a) =>
      a.name.toLowerCase() === name.toLowerCase() ||
      a.fullName.toLowerCase() === name.toLowerCase()
  );
  return account?.id ?? null;
}

function formatCurrency(amount: number, currency = "EUR"): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency,
  }).format(amount);
}

// ============================================
// READ-ONLY TOOLS
// ============================================

server.registerTool(
  "list_accounts",
  {
    title: "List Accounts",
    description: "List all accounts in Banktivity with their types and current balances",
    inputSchema: {
      include_hidden: z.boolean().optional().default(false).describe("Include hidden accounts"),
      include_categories: z.boolean().optional().default(false).describe("Include income/expense categories"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ include_hidden, include_categories }) => {
    let accounts = db.getAccounts(include_hidden);

    if (!include_categories) {
      accounts = accounts.filter((a) => a.accountClass < 6000);
    }

    const accountsWithBalances = accounts.map((account) => ({
      ...account,
      balance: db.getAccountBalance(account.id),
      formattedBalance: formatCurrency(db.getAccountBalance(account.id), account.currency ?? "EUR"),
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(accountsWithBalances, null, 2) }],
    };
  }
);

server.registerTool(
  "get_account_balance",
  {
    title: "Get Account Balance",
    description: "Get the current balance for a specific account",
    inputSchema: {
      account_id: z.number().optional().describe("The account ID"),
      account_name: z.string().optional().describe("The account name (alternative to account_id)"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ account_id, account_name }) => {
    let accountId = account_id;

    if (!accountId && account_name) {
      accountId = findAccountByName(account_name) ?? undefined;
      if (!accountId) {
        return {
          content: [{ type: "text", text: `Account not found: ${account_name}` }],
          isError: true,
        };
      }
    }

    if (!accountId) {
      return {
        content: [{ type: "text", text: "Either account_id or account_name is required" }],
        isError: true,
      };
    }

    const balance = db.getAccountBalance(accountId);
    const accounts = db.getAccounts(true);
    const account = accounts.find((a) => a.id === accountId);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              accountId,
              accountName: account?.name,
              balance,
              formattedBalance: formatCurrency(balance, account?.currency ?? "EUR"),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  "get_transactions",
  {
    title: "Get Transactions",
    description: "Get transactions with optional filtering by account, date range",
    inputSchema: {
      account_id: z.number().optional().describe("Filter by account ID"),
      account_name: z.string().optional().describe("Filter by account name (alternative to account_id)"),
      start_date: z.string().optional().describe("Start date in ISO format (YYYY-MM-DD)"),
      end_date: z.string().optional().describe("End date in ISO format (YYYY-MM-DD)"),
      limit: z.number().optional().default(50).describe("Maximum number of transactions to return"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ account_id, account_name, start_date, end_date, limit }) => {
    let accountId = account_id;

    if (!accountId && account_name) {
      accountId = findAccountByName(account_name) ?? undefined;
    }

    const transactions = db.getTransactions({
      accountId,
      startDate: start_date,
      endDate: end_date,
      limit,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(transactions, null, 2) }],
    };
  }
);

server.registerTool(
  "search_transactions",
  {
    title: "Search Transactions",
    description: "Search transactions by payee name or notes",
    inputSchema: {
      query: z.string().describe("Search query to match against transaction titles and notes"),
      limit: z.number().optional().default(50).describe("Maximum number of results"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ query, limit }) => {
    const transactions = db.searchTransactions(query, limit);

    return {
      content: [{ type: "text", text: JSON.stringify(transactions, null, 2) }],
    };
  }
);

server.registerTool(
  "get_spending_by_category",
  {
    title: "Get Spending by Category",
    description: "Get spending breakdown by expense category",
    inputSchema: {
      start_date: z.string().optional().describe("Start date in ISO format (YYYY-MM-DD)"),
      end_date: z.string().optional().describe("End date in ISO format (YYYY-MM-DD)"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ start_date, end_date }) => {
    const spending = db.getSpendingByCategory({
      startDate: start_date,
      endDate: end_date,
    });

    const formattedSpending = spending.map((s) => ({
      ...s,
      formattedTotal: formatCurrency(s.total),
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(formattedSpending, null, 2) }],
    };
  }
);

server.registerTool(
  "get_income_by_category",
  {
    title: "Get Income by Category",
    description: "Get income breakdown by income category",
    inputSchema: {
      start_date: z.string().optional().describe("Start date in ISO format (YYYY-MM-DD)"),
      end_date: z.string().optional().describe("End date in ISO format (YYYY-MM-DD)"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ start_date, end_date }) => {
    const income = db.getIncomeByCategory({
      startDate: start_date,
      endDate: end_date,
    });

    const formattedIncome = income.map((i) => ({
      ...i,
      formattedTotal: formatCurrency(i.total),
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(formattedIncome, null, 2) }],
    };
  }
);

server.registerTool(
  "get_net_worth",
  {
    title: "Get Net Worth",
    description: "Calculate current net worth (assets minus liabilities)",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    const netWorth = db.getNetWorth();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ...netWorth,
              formattedAssets: formatCurrency(netWorth.assets),
              formattedLiabilities: formatCurrency(netWorth.liabilities),
              formattedNetWorth: formatCurrency(netWorth.netWorth),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  "get_tags",
  {
    title: "Get Tags",
    description: "List all tags used for transactions",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    const tags = db.getTags();

    return {
      content: [{ type: "text", text: JSON.stringify(tags, null, 2) }],
    };
  }
);

server.registerTool(
  "get_summary",
  {
    title: "Get Summary",
    description: "Get a summary of the Banktivity database including account counts and transaction totals",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    const accounts = db.getAccounts(true);
    const transactionCount = db.getTransactionCount();
    const netWorth = db.getNetWorth();
    const tags = db.getTags();

    const bankAccounts = accounts.filter((a) => a.accountClass < 6000);
    const incomeCategories = accounts.filter((a) => a.accountClass === 6000);
    const expenseCategories = accounts.filter((a) => a.accountClass === 7000);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              accounts: {
                total: bankAccounts.length,
                checking: bankAccounts.filter((a) => a.accountClass === 1006).length,
                savings: bankAccounts.filter((a) => a.accountClass === 1002).length,
                creditCards: bankAccounts.filter((a) => a.accountClass === 5001).length,
              },
              categories: {
                income: incomeCategories.length,
                expense: expenseCategories.length,
              },
              transactions: transactionCount,
              tags: tags.length,
              netWorth: {
                ...netWorth,
                formattedAssets: formatCurrency(netWorth.assets),
                formattedLiabilities: formatCurrency(netWorth.liabilities),
                formattedNetWorth: formatCurrency(netWorth.netWorth),
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ============================================
// WRITE TOOLS
// ============================================

const lineItemSchema = z.object({
  account_id: z.number().optional().describe("The account ID for this line item"),
  account_name: z.string().optional().describe("The account name (alternative to account_id)"),
  amount: z.number().describe("The amount (positive for income/deposit, negative for expense/withdrawal)"),
  memo: z.string().optional().describe("Optional memo for this line item"),
});

server.registerTool(
  "create_transaction",
  {
    title: "Create Transaction",
    description: "Create a new transaction with one or more line items (splits)",
    inputSchema: {
      title: z.string().describe("The payee or description of the transaction"),
      date: z.string().describe("Transaction date in ISO format (YYYY-MM-DD)"),
      note: z.string().optional().describe("Optional note/memo for the transaction"),
      transaction_type: z.string().optional().describe("Transaction type (e.g., 'Deposit', 'Withdrawal', 'Transfer')"),
      line_items: z.array(lineItemSchema).min(1).describe("Array of line items (at least one required)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  async ({ title, date, note, transaction_type, line_items }) => {
    // Resolve account IDs for line items
    const lineItems: Array<{ accountId: number; amount: number; memo?: string }> = [];
    for (const item of line_items) {
      let accountId = item.account_id;
      if (!accountId && item.account_name) {
        accountId = findAccountByName(item.account_name) ?? undefined;
      }
      if (!accountId) {
        return {
          content: [
            {
              type: "text",
              text: `Account not found for line item: ${item.account_name || "no account specified"}`,
            },
          ],
          isError: true,
        };
      }
      lineItems.push({
        accountId,
        amount: item.amount,
        memo: item.memo,
      });
    }

    const result = db.createTransaction({
      title,
      date,
      note,
      transactionType: transaction_type,
      lineItems,
    });

    const transaction = db.getTransactionById(result.transactionId);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: "Transaction created successfully",
              transactionId: result.transactionId,
              lineItemIds: result.lineItemIds,
              transaction,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  "update_transaction",
  {
    title: "Update Transaction",
    description: "Update an existing transaction's title, date, note, or cleared status",
    inputSchema: {
      transaction_id: z.number().describe("The transaction ID to update"),
      title: z.string().optional().describe("New title/payee"),
      date: z.string().optional().describe("New date in ISO format (YYYY-MM-DD)"),
      note: z.string().optional().describe("New note/memo"),
      cleared: z.boolean().optional().describe("Set cleared/reconciled status"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  async ({ transaction_id, title, date, note, cleared }) => {
    const updates: { title?: string; date?: string; note?: string; cleared?: boolean } = {};

    if (title !== undefined) updates.title = title;
    if (date !== undefined) updates.date = date;
    if (note !== undefined) updates.note = note;
    if (cleared !== undefined) updates.cleared = cleared;

    const success = db.updateTransaction(transaction_id, updates);

    if (!success) {
      return {
        content: [{ type: "text", text: "Transaction not found or no updates provided" }],
        isError: true,
      };
    }

    const transaction = db.getTransactionById(transaction_id);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: "Transaction updated successfully",
              transaction,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  "delete_transaction",
  {
    title: "Delete Transaction",
    description: "Delete a transaction and all its line items",
    inputSchema: {
      transaction_id: z.number().describe("The transaction ID to delete"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  async ({ transaction_id }) => {
    // Get transaction details before deletion for confirmation
    const transaction = db.getTransactionById(transaction_id);
    if (!transaction) {
      return {
        content: [{ type: "text", text: `Transaction not found: ${transaction_id}` }],
        isError: true,
      };
    }

    db.deleteTransaction(transaction_id);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: "Transaction deleted successfully",
              deletedTransaction: transaction,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

const accountTypeEnum = z.enum(["checking", "savings", "credit_card", "income", "expense"]);

server.registerTool(
  "create_account",
  {
    title: "Create Account",
    description: "Create a new account (checking, savings, credit card, or category)",
    inputSchema: {
      name: z.string().describe("The account name"),
      full_name: z.string().optional().describe("The full account name (defaults to name)"),
      account_type: accountTypeEnum.describe("The type of account to create"),
      currency_code: z.string().optional().describe("Currency code (e.g., 'EUR', 'USD'). Defaults to database default."),
      hidden: z.boolean().optional().default(false).describe("Whether the account should be hidden"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  async ({ name, full_name, account_type, currency_code, hidden }) => {
    const accountClassMap: Record<string, number> = {
      checking: 1006,
      savings: 1002,
      credit_card: 5001,
      income: 6000,
      expense: 7000,
    };

    const accountClass = accountClassMap[account_type];

    const accountId = db.createAccount({
      name,
      fullName: full_name,
      accountClass,
      currencyCode: currency_code,
      hidden,
    });

    const account = db.getAccountById(accountId);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: "Account created successfully",
              accountId,
              account,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  "create_tag",
  {
    title: "Create Tag",
    description: "Create a new tag for categorizing transactions",
    inputSchema: {
      name: z.string().describe("The tag name"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  async ({ name }) => {
    const tagId = db.createTag(name);
    const tag = db.getTagByName(name);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: "Tag created successfully",
              tagId,
              tag,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  "tag_transaction",
  {
    title: "Tag Transaction",
    description: "Add or remove a tag from a transaction",
    inputSchema: {
      transaction_id: z.number().describe("The transaction ID"),
      tag_name: z.string().optional().describe("The tag name (will be created if it doesn't exist)"),
      tag_id: z.number().optional().describe("The tag ID (alternative to tag_name)"),
      action: z.enum(["add", "remove"]).optional().default("add").describe("Whether to add or remove the tag"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  async ({ transaction_id, tag_name, tag_id, action }) => {
    let resolvedTagId = tag_id;

    if (!resolvedTagId && tag_name) {
      if (action === "add") {
        // Create tag if it doesn't exist
        resolvedTagId = db.createTag(tag_name);
      } else {
        // Look up existing tag
        const tag = db.getTagByName(tag_name);
        if (!tag) {
          return {
            content: [{ type: "text", text: `Tag not found: ${tag_name}` }],
            isError: true,
          };
        }
        resolvedTagId = tag.id;
      }
    }

    if (!resolvedTagId) {
      return {
        content: [{ type: "text", text: "Either tag_id or tag_name is required" }],
        isError: true,
      };
    }

    let affected: number;
    if (action === "remove") {
      affected = db.untagTransaction(transaction_id, resolvedTagId);
    } else {
      affected = db.tagTransaction(transaction_id, resolvedTagId);
    }

    const transaction = db.getTransactionById(transaction_id);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: `Tag ${action === "remove" ? "removed from" : "added to"} ${affected} line item(s)`,
              transactionId: transaction_id,
              tagId: resolvedTagId,
              transaction,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  "reconcile_transactions",
  {
    title: "Reconcile Transactions",
    description: "Mark one or more transactions as cleared/reconciled",
    inputSchema: {
      transaction_ids: z.array(z.number()).min(1).describe("Array of transaction IDs to reconcile"),
      cleared: z.boolean().optional().default(true).describe("Set to true to mark as cleared, false to unmark"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  async ({ transaction_ids, cleared }) => {
    const updated = db.reconcileTransactions(transaction_ids, cleared);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: `${updated} transaction(s) ${cleared ? "marked as cleared" : "marked as uncleared"}`,
              transactionIds: transaction_ids,
              cleared,
              updatedCount: updated,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ============================================
// SERVER STARTUP
// ============================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Banktivity MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
