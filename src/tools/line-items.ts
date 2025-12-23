import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BanktivityDatabase } from "../database/index.js";
import {
  jsonResponse,
  errorResponse,
  successResponse,
  resolveAccountIdOrError,
  isErrorResponse,
} from "./helpers.js";

/**
 * Register line item-related tools
 */
export function registerLineItemTools(server: McpServer, db: BanktivityDatabase): void {
  server.registerTool(
    "get_line_item",
    {
      title: "Get Line Item",
      description: "Get a specific line item by ID",
      inputSchema: {
        line_item_id: z.number().describe("The line item ID"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ line_item_id }) => {
      const lineItem = db.lineItems.getById(line_item_id);
      if (!lineItem) {
        return errorResponse(`Line item not found: ${line_item_id}`);
      }
      return jsonResponse(lineItem);
    }
  );

  server.registerTool(
    "update_line_item",
    {
      title: "Update Line Item",
      description: "Update a line item's account, amount, or memo",
      inputSchema: {
        line_item_id: z.number().describe("The line item ID to update"),
        account_id: z.number().optional().describe("New account ID"),
        account_name: z.string().optional().describe("New account name (alternative to account_id)"),
        amount: z.number().optional().describe("New amount"),
        memo: z.string().optional().describe("New memo"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ line_item_id, account_id, account_name, amount, memo }) => {
      let accountId = account_id;
      if (!accountId && account_name) {
        const resolved = resolveAccountIdOrError(db, undefined, account_name);
        if (isErrorResponse(resolved)) return resolved;
        accountId = resolved;
      }

      const updates: { accountId?: number; amount?: number; memo?: string } = {};
      if (accountId !== undefined) updates.accountId = accountId;
      if (amount !== undefined) updates.amount = amount;
      if (memo !== undefined) updates.memo = memo;

      const success = db.updateLineItem(line_item_id, updates);

      if (!success) {
        return errorResponse("Line item not found or no updates provided");
      }

      const lineItem = db.lineItems.getById(line_item_id);

      return successResponse("Line item updated successfully", { lineItem });
    }
  );

  server.registerTool(
    "delete_line_item",
    {
      title: "Delete Line Item",
      description: "Delete a line item from a transaction",
      inputSchema: {
        line_item_id: z.number().describe("The line item ID to delete"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ line_item_id }) => {
      const lineItem = db.lineItems.getById(line_item_id);
      if (!lineItem) {
        return errorResponse(`Line item not found: ${line_item_id}`);
      }

      db.deleteLineItem(line_item_id);

      return successResponse("Line item deleted successfully", { deletedLineItem: lineItem });
    }
  );

  server.registerTool(
    "add_line_item",
    {
      title: "Add Line Item",
      description: "Add a new line item to an existing transaction",
      inputSchema: {
        transaction_id: z.number().describe("The transaction ID to add the line item to"),
        account_id: z.number().optional().describe("The account ID for this line item"),
        account_name: z.string().optional().describe("The account name (alternative to account_id)"),
        amount: z.number().describe("The amount (positive for income/deposit, negative for expense/withdrawal)"),
        memo: z.string().optional().describe("Optional memo for this line item"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ transaction_id, account_id, account_name, amount, memo }) => {
      const transaction = db.transactions.getById(transaction_id);
      if (!transaction) {
        return errorResponse(`Transaction not found: ${transaction_id}`);
      }

      const accountId = resolveAccountIdOrError(db, account_id, account_name);
      if (isErrorResponse(accountId)) return accountId;

      const lineItemId = db.addLineItemToTransaction(transaction_id, {
        accountId,
        amount,
        memo,
      });

      const lineItem = db.lineItems.getById(lineItemId);

      return successResponse("Line item added successfully", {
        lineItemId,
        lineItem,
      });
    }
  );
}
