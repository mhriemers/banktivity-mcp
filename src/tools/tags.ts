import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BanktivityDatabase } from "../database/index.js";
import { jsonResponse, errorResponse, successResponse } from "./helpers.js";

/**
 * Register tag-related tools
 */
export function registerTagTools(server: McpServer, db: BanktivityDatabase): void {
  server.registerTool(
    "get_tags",
    {
      title: "Get Tags",
      description: "List all tags used for transactions",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const tags = db.tags.getAll();
      return jsonResponse(tags);
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
      const tagId = db.tags.create(name);
      const tag = db.tags.getByName(name);

      return successResponse("Tag created successfully", { tagId, tag });
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
          resolvedTagId = db.tags.create(tag_name);
        } else {
          const tag = db.tags.getByName(tag_name);
          if (!tag) {
            return errorResponse(`Tag not found: ${tag_name}`);
          }
          resolvedTagId = tag.id;
        }
      }

      if (!resolvedTagId) {
        return errorResponse("Either tag_id or tag_name is required");
      }

      let affected: number;
      if (action === "remove") {
        affected = db.tags.untagTransaction(transaction_id, resolvedTagId);
      } else {
        affected = db.tags.tagTransaction(transaction_id, resolvedTagId);
      }

      const transaction = db.transactions.getById(transaction_id);

      return successResponse(
        `Tag ${action === "remove" ? "removed from" : "added to"} ${affected} line item(s)`,
        {
          transactionId: transaction_id,
          tagId: resolvedTagId,
          transaction,
        }
      );
    }
  );
}
