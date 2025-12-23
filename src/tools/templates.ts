import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BanktivityDatabase } from "../database/index.js";
import { jsonResponse, errorResponse, successResponse } from "./helpers.js";

/**
 * Register transaction template-related tools
 */
export function registerTemplateTools(server: McpServer, db: BanktivityDatabase): void {
  server.registerTool(
    "list_transaction_templates",
    {
      title: "List Transaction Templates",
      description: "List all transaction templates (used for import rules and scheduled transactions)",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const templates = db.templates.getAll();
      return jsonResponse(templates);
    }
  );

  server.registerTool(
    "get_transaction_template",
    {
      title: "Get Transaction Template",
      description: "Get a specific transaction template by ID",
      inputSchema: {
        template_id: z.number().describe("The template ID"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ template_id }) => {
      const template = db.templates.getById(template_id);
      if (!template) {
        return errorResponse(`Template not found: ${template_id}`);
      }
      return jsonResponse(template);
    }
  );

  server.registerTool(
    "create_transaction_template",
    {
      title: "Create Transaction Template",
      description: "Create a new transaction template for use with import rules or scheduled transactions",
      inputSchema: {
        title: z.string().describe("The template title (payee name)"),
        amount: z.number().describe("The default transaction amount"),
        note: z.string().optional().describe("Optional note"),
        currency_id: z.string().optional().describe("Currency UUID"),
        line_items: z
          .array(
            z.object({
              account_id: z.string().describe("Account UUID"),
              amount: z.number().describe("Line item amount"),
              memo: z.string().optional().describe("Line item memo"),
            })
          )
          .optional()
          .describe("Optional line items for split transactions"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ title, amount, note, currency_id, line_items }) => {
      const templateId = db.templates.create({
        title,
        amount,
        note,
        currencyId: currency_id,
        lineItems: line_items?.map((li) => ({
          accountId: li.account_id,
          amount: li.amount,
          memo: li.memo,
        })),
      });

      const template = db.templates.getById(templateId);
      return successResponse("Template created successfully", { templateId, template });
    }
  );

  server.registerTool(
    "update_transaction_template",
    {
      title: "Update Transaction Template",
      description: "Update an existing transaction template",
      inputSchema: {
        template_id: z.number().describe("The template ID to update"),
        title: z.string().optional().describe("New title"),
        amount: z.number().optional().describe("New amount"),
        note: z.string().optional().describe("New note"),
        active: z.boolean().optional().describe("Set active status"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ template_id, title, amount, note, active }) => {
      const success = db.templates.update(template_id, { title, amount, note, active });

      if (!success) {
        return errorResponse("Template not found or no updates provided");
      }

      const template = db.templates.getById(template_id);
      return successResponse("Template updated successfully", { template });
    }
  );

  server.registerTool(
    "delete_transaction_template",
    {
      title: "Delete Transaction Template",
      description: "Delete a transaction template (also deletes associated import rules and schedules)",
      inputSchema: {
        template_id: z.number().describe("The template ID to delete"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ template_id }) => {
      const template = db.templates.getById(template_id);
      if (!template) {
        return errorResponse(`Template not found: ${template_id}`);
      }

      db.templates.delete(template_id);
      return successResponse("Template deleted successfully", { deletedTemplate: template });
    }
  );
}
