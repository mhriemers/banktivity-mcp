import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BanktivityClient } from "banktivity-sdk";
import {
  jsonResponse,
  successResponse,
  formatCurrency,
  resolveAccountIdOrError,
  isErrorResponse,
} from "./helpers.js";

/**
 * Register account-related tools
 */
export function registerAccountTools(
  server: McpServer,
  client: BanktivityClient
): void {
  server.registerTool(
    "list_accounts",
    {
      title: "List Accounts",
      description:
        "List all accounts in Banktivity with their types and current balances",
      inputSchema: {
        include_hidden: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include hidden accounts"),
        include_categories: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include income/expense categories"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ include_hidden, include_categories }) => {
      let accounts = client.accounts.list({ includeHidden: include_hidden });

      if (!include_categories) {
        accounts = accounts.filter((a) => a.accountClass < 6000);
      }

      const accountsWithBalances = accounts.map((account) => ({
        ...account,
        balance: client.accounts.getBalance(account.id),
        formattedBalance: formatCurrency(
          client.accounts.getBalance(account.id),
          account.currency ?? "EUR"
        ),
      }));

      return jsonResponse(accountsWithBalances);
    }
  );

  server.registerTool(
    "get_account_balance",
    {
      title: "Get Account Balance",
      description: "Get the current balance for a specific account",
      inputSchema: {
        account_id: z.number().optional().describe("The account ID"),
        account_name: z
          .string()
          .optional()
          .describe("The account name (alternative to account_id)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ account_id, account_name }) => {
      const accountId = resolveAccountIdOrError(client, account_id, account_name);
      if (isErrorResponse(accountId)) return accountId;

      const balance = client.accounts.getBalance(accountId);
      const account = client.accounts.get(accountId);

      return jsonResponse({
        accountId,
        accountName: account?.name,
        balance,
        formattedBalance: formatCurrency(balance, account?.currency ?? "EUR"),
      });
    }
  );

  const accountTypeEnum = z.enum([
    "checking",
    "savings",
    "credit_card",
    "income",
    "expense",
  ]);

  server.registerTool(
    "create_account",
    {
      title: "Create Account",
      description:
        "Create a new account (checking, savings, credit card, or category)",
      inputSchema: {
        name: z.string().describe("The account name"),
        full_name: z
          .string()
          .optional()
          .describe("The full account name (defaults to name)"),
        account_type: accountTypeEnum.describe("The type of account to create"),
        currency_code: z
          .string()
          .optional()
          .describe(
            "Currency code (e.g., 'EUR', 'USD'). Defaults to database default."
          ),
        hidden: z
          .boolean()
          .optional()
          .default(false)
          .describe("Whether the account should be hidden"),
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

      const accountId = client.accounts.create({
        name,
        fullName: full_name,
        accountClass: accountClassMap[account_type],
        currencyCode: currency_code,
        hidden,
      });

      const account = client.accounts.get(accountId);

      return successResponse("Account created successfully", {
        accountId,
        account,
      });
    }
  );

  server.registerTool(
    "get_spending_by_category",
    {
      title: "Get Spending by Category",
      description: "Get spending breakdown by expense category",
      inputSchema: {
        start_date: z
          .string()
          .optional()
          .describe("Start date in ISO format (YYYY-MM-DD)"),
        end_date: z
          .string()
          .optional()
          .describe("End date in ISO format (YYYY-MM-DD)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ start_date, end_date }) => {
      const spending = client.accounts.getCategoryAnalysis("expense", {
        startDate: start_date,
        endDate: end_date,
      });

      const formattedSpending = spending.map((s) => ({
        ...s,
        formattedTotal: formatCurrency(s.total),
      }));

      return jsonResponse(formattedSpending);
    }
  );

  server.registerTool(
    "get_income_by_category",
    {
      title: "Get Income by Category",
      description: "Get income breakdown by income category",
      inputSchema: {
        start_date: z
          .string()
          .optional()
          .describe("Start date in ISO format (YYYY-MM-DD)"),
        end_date: z
          .string()
          .optional()
          .describe("End date in ISO format (YYYY-MM-DD)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ start_date, end_date }) => {
      const income = client.accounts.getCategoryAnalysis("income", {
        startDate: start_date,
        endDate: end_date,
      });

      const formattedIncome = income.map((i) => ({
        ...i,
        formattedTotal: formatCurrency(i.total),
      }));

      return jsonResponse(formattedIncome);
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
      const netWorth = client.accounts.getNetWorth();

      return jsonResponse({
        ...netWorth,
        formattedAssets: formatCurrency(netWorth.assets),
        formattedLiabilities: formatCurrency(netWorth.liabilities),
        formattedNetWorth: formatCurrency(netWorth.netWorth),
      });
    }
  );

  server.registerTool(
    "get_summary",
    {
      title: "Get Summary",
      description:
        "Get a summary of the Banktivity database including account counts and transaction totals",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const accounts = client.accounts.list({ includeHidden: true });
      const transactionCount = client.transactions.count();
      const netWorth = client.accounts.getNetWorth();
      const tags = client.tags.list();

      const bankAccounts = accounts.filter((a) => a.accountClass < 6000);
      const incomeCategories = accounts.filter((a) => a.accountClass === 6000);
      const expenseCategories = accounts.filter((a) => a.accountClass === 7000);

      return jsonResponse({
        accounts: {
          total: bankAccounts.length,
          checking: bankAccounts.filter((a) => a.accountClass === 1006).length,
          savings: bankAccounts.filter((a) => a.accountClass === 1002).length,
          creditCards: bankAccounts.filter((a) => a.accountClass === 5001)
            .length,
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
      });
    }
  );
}
