import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BanktivityClient } from "banktivity-sdk";
import {
  jsonResponse,
  errorResponse,
  successResponse,
  resolveAccountId,
  resolveAccountIdOrError,
  isErrorResponse,
} from "./helpers.js";

const lineItemSchema = z.object({
  account_id: z
    .number()
    .optional()
    .describe("The account ID for this line item"),
  account_name: z
    .string()
    .optional()
    .describe("The account name (alternative to account_id)"),
  amount: z
    .number()
    .describe(
      "The amount (positive for income/deposit, negative for expense/withdrawal)"
    ),
  memo: z.string().optional().describe("Optional memo for this line item"),
});

/**
 * Register transaction-related tools
 */
export function registerTransactionTools(
  server: McpServer,
  client: BanktivityClient
): void {
  server.registerTool(
    "get_transactions",
    {
      title: "Get Transactions",
      description:
        "Get transactions with optional filtering by account, date range",
      inputSchema: {
        account_id: z.number().optional().describe("Filter by account ID"),
        account_name: z
          .string()
          .optional()
          .describe("Filter by account name (alternative to account_id)"),
        start_date: z
          .string()
          .optional()
          .describe("Start date in ISO format (YYYY-MM-DD)"),
        end_date: z
          .string()
          .optional()
          .describe("End date in ISO format (YYYY-MM-DD)"),
        limit: z
          .number()
          .optional()
          .default(50)
          .describe("Maximum number of transactions to return"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ account_id, account_name, start_date, end_date, limit }) => {
      const accountId =
        resolveAccountId(client, account_id, account_name) ?? undefined;

      const transactions = client.transactions.list({
        accountId,
        startDate: start_date,
        endDate: end_date,
        limit,
      });

      return jsonResponse(transactions);
    }
  );

  server.registerTool(
    "search_transactions",
    {
      title: "Search Transactions",
      description: "Search transactions by payee name or notes",
      inputSchema: {
        query: z
          .string()
          .describe(
            "Search query to match against transaction titles and notes"
          ),
        limit: z
          .number()
          .optional()
          .default(50)
          .describe("Maximum number of results"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit }) => {
      const transactions = client.transactions.search(query, limit);
      return jsonResponse(transactions);
    }
  );

  server.registerTool(
    "create_transaction",
    {
      title: "Create Transaction",
      description:
        "Create a new transaction with one or more line items (splits)",
      inputSchema: {
        title: z
          .string()
          .describe("The payee or description of the transaction"),
        date: z.string().describe("Transaction date in ISO format (YYYY-MM-DD)"),
        note: z
          .string()
          .optional()
          .describe("Optional note/memo for the transaction"),
        transaction_type: z
          .string()
          .optional()
          .describe(
            "Transaction type (e.g., 'Deposit', 'Withdrawal', 'Transfer')"
          ),
        line_items: z
          .array(lineItemSchema)
          .min(1)
          .describe("Array of line items (at least one required)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ title, date, note, transaction_type, line_items }) => {
      const lineItems: Array<{
        accountId: number;
        amount: number;
        memo?: string;
      }> = [];

      for (const item of line_items) {
        const accountId = resolveAccountIdOrError(
          client,
          item.account_id,
          item.account_name
        );
        if (isErrorResponse(accountId)) {
          return errorResponse(
            `Account not found for line item: ${item.account_name || "no account specified"}`
          );
        }
        lineItems.push({
          accountId,
          amount: item.amount,
          memo: item.memo,
        });
      }

      const result = client.transactions.create({
        title,
        date,
        note,
        transactionType: transaction_type,
        lineItems,
      });

      const transaction = client.transactions.get(result.transactionId);

      return successResponse("Transaction created successfully", {
        transactionId: result.transactionId,
        lineItemIds: result.lineItemIds,
        transaction,
      });
    }
  );

  server.registerTool(
    "update_transaction",
    {
      title: "Update Transaction",
      description:
        "Update an existing transaction's title, date, note, or cleared status",
      inputSchema: {
        transaction_id: z.number().describe("The transaction ID to update"),
        title: z.string().optional().describe("New title/payee"),
        date: z
          .string()
          .optional()
          .describe("New date in ISO format (YYYY-MM-DD)"),
        note: z.string().optional().describe("New note/memo"),
        cleared: z
          .boolean()
          .optional()
          .describe("Set cleared/reconciled status"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ transaction_id, title, date, note, cleared }) => {
      const updates: {
        title?: string;
        date?: string;
        note?: string;
        cleared?: boolean;
      } = {};

      if (title !== undefined) updates.title = title;
      if (date !== undefined) updates.date = date;
      if (note !== undefined) updates.note = note;
      if (cleared !== undefined) updates.cleared = cleared;

      const success = client.transactions.update(transaction_id, updates);

      if (!success) {
        return errorResponse("Transaction not found or no updates provided");
      }

      const transaction = client.transactions.get(transaction_id);

      return successResponse("Transaction updated successfully", {
        transaction,
      });
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
      const transaction = client.transactions.get(transaction_id);
      if (!transaction) {
        return errorResponse(`Transaction not found: ${transaction_id}`);
      }

      client.transactions.delete(transaction_id);

      return successResponse("Transaction deleted successfully", {
        deletedTransaction: transaction,
      });
    }
  );

  server.registerTool(
    "reconcile_transactions",
    {
      title: "Reconcile Transactions",
      description: "Mark one or more transactions as cleared/reconciled",
      inputSchema: {
        transaction_ids: z
          .array(z.number())
          .min(1)
          .describe("Array of transaction IDs to reconcile"),
        cleared: z
          .boolean()
          .optional()
          .default(true)
          .describe("Set to true to mark as cleared, false to unmark"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ transaction_ids, cleared }) => {
      const updated = client.transactions.reconcile(transaction_ids, cleared);

      return successResponse(
        `${updated} transaction(s) ${cleared ? "marked as cleared" : "marked as uncleared"}`,
        {
          transactionIds: transaction_ids,
          cleared,
          updatedCount: updated,
        }
      );
    }
  );
}
