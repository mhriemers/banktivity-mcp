#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { BanktivityDatabase } from "./database.js";

const BANK_FILE_PATH = process.env.BANKTIVITY_FILE_PATH;

if (!BANK_FILE_PATH) {
  console.error("Error: BANKTIVITY_FILE_PATH environment variable is required");
  console.error("Set it to the path of your .bank8 file");
  process.exit(1);
}

const db = new BanktivityDatabase(BANK_FILE_PATH);

const tools: Tool[] = [
  {
    name: "list_accounts",
    description: "List all accounts in Banktivity with their types and current balances",
    inputSchema: {
      type: "object",
      properties: {
        include_hidden: {
          type: "boolean",
          description: "Include hidden accounts (default: false)",
        },
        include_categories: {
          type: "boolean",
          description: "Include income/expense categories (default: false)",
        },
      },
    },
  },
  {
    name: "get_account_balance",
    description: "Get the current balance for a specific account",
    inputSchema: {
      type: "object",
      properties: {
        account_id: {
          type: "number",
          description: "The account ID",
        },
        account_name: {
          type: "string",
          description: "The account name (alternative to account_id)",
        },
      },
    },
  },
  {
    name: "get_transactions",
    description: "Get transactions with optional filtering by account, date range",
    inputSchema: {
      type: "object",
      properties: {
        account_id: {
          type: "number",
          description: "Filter by account ID",
        },
        account_name: {
          type: "string",
          description: "Filter by account name (alternative to account_id)",
        },
        start_date: {
          type: "string",
          description: "Start date in ISO format (YYYY-MM-DD)",
        },
        end_date: {
          type: "string",
          description: "End date in ISO format (YYYY-MM-DD)",
        },
        limit: {
          type: "number",
          description: "Maximum number of transactions to return (default: 50)",
        },
      },
    },
  },
  {
    name: "search_transactions",
    description: "Search transactions by payee name or notes",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query to match against transaction titles and notes",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default: 50)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_spending_by_category",
    description: "Get spending breakdown by expense category",
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date in ISO format (YYYY-MM-DD)",
        },
        end_date: {
          type: "string",
          description: "End date in ISO format (YYYY-MM-DD)",
        },
      },
    },
  },
  {
    name: "get_income_by_category",
    description: "Get income breakdown by income category",
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date in ISO format (YYYY-MM-DD)",
        },
        end_date: {
          type: "string",
          description: "End date in ISO format (YYYY-MM-DD)",
        },
      },
    },
  },
  {
    name: "get_net_worth",
    description: "Calculate current net worth (assets minus liabilities)",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_tags",
    description: "List all tags used for transactions",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_summary",
    description: "Get a summary of the Banktivity database including account counts and transaction totals",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  // Write operations
  {
    name: "create_transaction",
    description: "Create a new transaction with one or more line items (splits)",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The payee or description of the transaction",
        },
        date: {
          type: "string",
          description: "Transaction date in ISO format (YYYY-MM-DD)",
        },
        note: {
          type: "string",
          description: "Optional note/memo for the transaction",
        },
        transaction_type: {
          type: "string",
          description: "Transaction type (e.g., 'Deposit', 'Withdrawal', 'Transfer')",
        },
        line_items: {
          type: "array",
          description: "Array of line items (at least one required)",
          items: {
            type: "object",
            properties: {
              account_id: {
                type: "number",
                description: "The account ID for this line item",
              },
              account_name: {
                type: "string",
                description: "The account name (alternative to account_id)",
              },
              amount: {
                type: "number",
                description: "The amount (positive for income/deposit, negative for expense/withdrawal)",
              },
              memo: {
                type: "string",
                description: "Optional memo for this line item",
              },
            },
            required: ["amount"],
          },
        },
      },
      required: ["title", "date", "line_items"],
    },
  },
  {
    name: "update_transaction",
    description: "Update an existing transaction's title, date, note, or cleared status",
    inputSchema: {
      type: "object",
      properties: {
        transaction_id: {
          type: "number",
          description: "The transaction ID to update",
        },
        title: {
          type: "string",
          description: "New title/payee",
        },
        date: {
          type: "string",
          description: "New date in ISO format (YYYY-MM-DD)",
        },
        note: {
          type: "string",
          description: "New note/memo",
        },
        cleared: {
          type: "boolean",
          description: "Set cleared/reconciled status",
        },
      },
      required: ["transaction_id"],
    },
  },
  {
    name: "delete_transaction",
    description: "Delete a transaction and all its line items",
    inputSchema: {
      type: "object",
      properties: {
        transaction_id: {
          type: "number",
          description: "The transaction ID to delete",
        },
      },
      required: ["transaction_id"],
    },
  },
  {
    name: "create_account",
    description: "Create a new account (checking, savings, credit card, or category)",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The account name",
        },
        full_name: {
          type: "string",
          description: "The full account name (defaults to name)",
        },
        account_type: {
          type: "string",
          enum: ["checking", "savings", "credit_card", "income", "expense"],
          description: "The type of account to create",
        },
        currency_code: {
          type: "string",
          description: "Currency code (e.g., 'EUR', 'USD'). Defaults to database default.",
        },
        hidden: {
          type: "boolean",
          description: "Whether the account should be hidden (default: false)",
        },
      },
      required: ["name", "account_type"],
    },
  },
  {
    name: "create_tag",
    description: "Create a new tag for categorizing transactions",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The tag name",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "tag_transaction",
    description: "Add or remove a tag from a transaction",
    inputSchema: {
      type: "object",
      properties: {
        transaction_id: {
          type: "number",
          description: "The transaction ID",
        },
        tag_name: {
          type: "string",
          description: "The tag name (will be created if it doesn't exist)",
        },
        tag_id: {
          type: "number",
          description: "The tag ID (alternative to tag_name)",
        },
        action: {
          type: "string",
          enum: ["add", "remove"],
          description: "Whether to add or remove the tag (default: add)",
        },
      },
      required: ["transaction_id"],
    },
  },
  {
    name: "reconcile_transactions",
    description: "Mark one or more transactions as cleared/reconciled",
    inputSchema: {
      type: "object",
      properties: {
        transaction_ids: {
          type: "array",
          items: { type: "number" },
          description: "Array of transaction IDs to reconcile",
        },
        cleared: {
          type: "boolean",
          description: "Set to true to mark as cleared, false to unmark (default: true)",
        },
      },
      required: ["transaction_ids"],
    },
  },
];

function findAccountByName(name: string): number | null {
  const accounts = db.getAccounts(true);
  const account = accounts.find(
    (a) => a.name.toLowerCase() === name.toLowerCase() ||
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

const server = new Server(
  {
    name: "banktivity-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_accounts": {
        const includeHidden = (args?.include_hidden as boolean) ?? false;
        const includeCategories = (args?.include_categories as boolean) ?? false;

        let accounts = db.getAccounts(includeHidden);

        if (!includeCategories) {
          accounts = accounts.filter((a) => a.accountClass < 6000);
        }

        const accountsWithBalances = accounts.map((account) => ({
          ...account,
          balance: db.getAccountBalance(account.id),
          formattedBalance: formatCurrency(db.getAccountBalance(account.id), account.currency ?? "EUR"),
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(accountsWithBalances, null, 2),
            },
          ],
        };
      }

      case "get_account_balance": {
        let accountId = args?.account_id as number | undefined;

        if (!accountId && args?.account_name) {
          accountId = findAccountByName(args.account_name as string) ?? undefined;
          if (!accountId) {
            return {
              content: [
                {
                  type: "text",
                  text: `Account not found: ${args.account_name}`,
                },
              ],
              isError: true,
            };
          }
        }

        if (!accountId) {
          return {
            content: [
              {
                type: "text",
                text: "Either account_id or account_name is required",
              },
            ],
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

      case "get_transactions": {
        let accountId = args?.account_id as number | undefined;

        if (!accountId && args?.account_name) {
          accountId = findAccountByName(args.account_name as string) ?? undefined;
        }

        const transactions = db.getTransactions({
          accountId,
          startDate: args?.start_date as string | undefined,
          endDate: args?.end_date as string | undefined,
          limit: (args?.limit as number) ?? 50,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(transactions, null, 2),
            },
          ],
        };
      }

      case "search_transactions": {
        const query = args?.query as string;
        if (!query) {
          return {
            content: [
              {
                type: "text",
                text: "query parameter is required",
              },
            ],
            isError: true,
          };
        }

        const transactions = db.searchTransactions(query, (args?.limit as number) ?? 50);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(transactions, null, 2),
            },
          ],
        };
      }

      case "get_spending_by_category": {
        const spending = db.getSpendingByCategory({
          startDate: args?.start_date as string | undefined,
          endDate: args?.end_date as string | undefined,
        });

        const formattedSpending = spending.map((s) => ({
          ...s,
          formattedTotal: formatCurrency(s.total),
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(formattedSpending, null, 2),
            },
          ],
        };
      }

      case "get_income_by_category": {
        const income = db.getIncomeByCategory({
          startDate: args?.start_date as string | undefined,
          endDate: args?.end_date as string | undefined,
        });

        const formattedIncome = income.map((i) => ({
          ...i,
          formattedTotal: formatCurrency(i.total),
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(formattedIncome, null, 2),
            },
          ],
        };
      }

      case "get_net_worth": {
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

      case "get_tags": {
        const tags = db.getTags();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(tags, null, 2),
            },
          ],
        };
      }

      case "get_summary": {
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

      // Write operations
      case "create_transaction": {
        const title = args?.title as string;
        const date = args?.date as string;
        const note = args?.note as string | undefined;
        const transactionType = args?.transaction_type as string | undefined;
        const lineItemsInput = args?.line_items as Array<{
          account_id?: number;
          account_name?: string;
          amount: number;
          memo?: string;
        }>;

        if (!title || !date || !lineItemsInput || lineItemsInput.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "title, date, and at least one line_item are required",
              },
            ],
            isError: true,
          };
        }

        // Resolve account IDs for line items
        const lineItems: Array<{ accountId: number; amount: number; memo?: string }> = [];
        for (const item of lineItemsInput) {
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
          transactionType,
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

      case "update_transaction": {
        const transactionId = args?.transaction_id as number;
        if (!transactionId) {
          return {
            content: [
              {
                type: "text",
                text: "transaction_id is required",
              },
            ],
            isError: true,
          };
        }

        const updates: {
          title?: string;
          date?: string;
          note?: string;
          cleared?: boolean;
        } = {};

        if (args?.title !== undefined) updates.title = args.title as string;
        if (args?.date !== undefined) updates.date = args.date as string;
        if (args?.note !== undefined) updates.note = args.note as string;
        if (args?.cleared !== undefined) updates.cleared = args.cleared as boolean;

        const success = db.updateTransaction(transactionId, updates);

        if (!success) {
          return {
            content: [
              {
                type: "text",
                text: "Transaction not found or no updates provided",
              },
            ],
            isError: true,
          };
        }

        const transaction = db.getTransactionById(transactionId);

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

      case "delete_transaction": {
        const transactionId = args?.transaction_id as number;
        if (!transactionId) {
          return {
            content: [
              {
                type: "text",
                text: "transaction_id is required",
              },
            ],
            isError: true,
          };
        }

        // Get transaction details before deletion for confirmation
        const transaction = db.getTransactionById(transactionId);
        if (!transaction) {
          return {
            content: [
              {
                type: "text",
                text: `Transaction not found: ${transactionId}`,
              },
            ],
            isError: true,
          };
        }

        db.deleteTransaction(transactionId);

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

      case "create_account": {
        const name = args?.name as string;
        const accountTypeStr = args?.account_type as string;

        if (!name || !accountTypeStr) {
          return {
            content: [
              {
                type: "text",
                text: "name and account_type are required",
              },
            ],
            isError: true,
          };
        }

        const accountClassMap: Record<string, number> = {
          checking: 1006,
          savings: 1002,
          credit_card: 5001,
          income: 6000,
          expense: 7000,
        };

        const accountClass = accountClassMap[accountTypeStr];
        if (!accountClass) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid account_type: ${accountTypeStr}. Must be one of: checking, savings, credit_card, income, expense`,
              },
            ],
            isError: true,
          };
        }

        const accountId = db.createAccount({
          name,
          fullName: args?.full_name as string | undefined,
          accountClass,
          currencyCode: args?.currency_code as string | undefined,
          hidden: args?.hidden as boolean | undefined,
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

      case "create_tag": {
        const name = args?.name as string;
        if (!name) {
          return {
            content: [
              {
                type: "text",
                text: "name is required",
              },
            ],
            isError: true,
          };
        }

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

      case "tag_transaction": {
        const transactionId = args?.transaction_id as number;
        if (!transactionId) {
          return {
            content: [
              {
                type: "text",
                text: "transaction_id is required",
              },
            ],
            isError: true,
          };
        }

        let tagId = args?.tag_id as number | undefined;
        const tagName = args?.tag_name as string | undefined;
        const action = (args?.action as string) ?? "add";

        if (!tagId && tagName) {
          if (action === "add") {
            // Create tag if it doesn't exist
            tagId = db.createTag(tagName);
          } else {
            // Look up existing tag
            const tag = db.getTagByName(tagName);
            if (!tag) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Tag not found: ${tagName}`,
                  },
                ],
                isError: true,
              };
            }
            tagId = tag.id;
          }
        }

        if (!tagId) {
          return {
            content: [
              {
                type: "text",
                text: "Either tag_id or tag_name is required",
              },
            ],
            isError: true,
          };
        }

        let affected: number;
        if (action === "remove") {
          affected = db.untagTransaction(transactionId, tagId);
        } else {
          affected = db.tagTransaction(transactionId, tagId);
        }

        const transaction = db.getTransactionById(transactionId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  message: `Tag ${action === "remove" ? "removed from" : "added to"} ${affected} line item(s)`,
                  transactionId,
                  tagId,
                  transaction,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "reconcile_transactions": {
        const transactionIds = args?.transaction_ids as number[];
        if (!transactionIds || transactionIds.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "transaction_ids array is required",
              },
            ],
            isError: true,
          };
        }

        const cleared = (args?.cleared as boolean) ?? true;
        const updated = db.reconcileTransactions(transactionIds, cleared);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  message: `${updated} transaction(s) ${cleared ? "marked as cleared" : "marked as uncleared"}`,
                  transactionIds,
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

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Banktivity MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
