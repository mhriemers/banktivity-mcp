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
