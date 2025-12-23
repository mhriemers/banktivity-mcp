import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BanktivityClient } from "@mhriemers/banktivity-sdk";
import { jsonResponse, errorResponse, successResponse } from "./helpers.js";

/**
 * Register scheduled transaction-related tools
 */
export function registerScheduledTransactionTools(
  server: McpServer,
  client: BanktivityClient
): void {
  server.registerTool(
    "list_scheduled_transactions",
    {
      title: "List Scheduled Transactions",
      description: "List all scheduled/recurring transactions",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const schedules = client.scheduledTransactions.list();
      return jsonResponse(schedules);
    }
  );

  server.registerTool(
    "get_scheduled_transaction",
    {
      title: "Get Scheduled Transaction",
      description: "Get a specific scheduled transaction by ID",
      inputSchema: {
        schedule_id: z.number().describe("The scheduled transaction ID"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ schedule_id }) => {
      const schedule = client.scheduledTransactions.get(schedule_id);
      if (!schedule) {
        return errorResponse(`Scheduled transaction not found: ${schedule_id}`);
      }
      return jsonResponse(schedule);
    }
  );

  server.registerTool(
    "create_scheduled_transaction",
    {
      title: "Create Scheduled Transaction",
      description: "Create a new scheduled/recurring transaction",
      inputSchema: {
        template_id: z.number().describe("The transaction template ID to use"),
        start_date: z
          .string()
          .describe("Start date in ISO format (YYYY-MM-DD)"),
        account_id: z
          .string()
          .optional()
          .describe("Account UUID for the transaction"),
        repeat_interval: z
          .number()
          .optional()
          .default(1)
          .describe("Repeat interval (1=daily, 7=weekly, 30=monthly)"),
        repeat_multiplier: z
          .number()
          .optional()
          .default(1)
          .describe("Multiplier for repeat interval"),
        reminder_days: z
          .number()
          .optional()
          .default(7)
          .describe("Days in advance to show reminder"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({
      template_id,
      start_date,
      account_id,
      repeat_interval,
      repeat_multiplier,
      reminder_days,
    }) => {
      // Verify template exists
      const template = client.templates.get(template_id);
      if (!template) {
        return errorResponse(`Template not found: ${template_id}`);
      }

      const scheduleId = client.scheduledTransactions.create({
        templateId: template_id,
        startDate: start_date,
        accountId: account_id,
        repeatInterval: repeat_interval,
        repeatMultiplier: repeat_multiplier,
        reminderDays: reminder_days,
      });

      const schedule = client.scheduledTransactions.get(scheduleId);
      return successResponse("Scheduled transaction created successfully", {
        scheduleId,
        schedule,
      });
    }
  );

  server.registerTool(
    "update_scheduled_transaction",
    {
      title: "Update Scheduled Transaction",
      description: "Update an existing scheduled transaction",
      inputSchema: {
        schedule_id: z
          .number()
          .describe("The scheduled transaction ID to update"),
        start_date: z
          .string()
          .optional()
          .describe("New start date in ISO format"),
        next_date: z
          .string()
          .optional()
          .describe("New next occurrence date in ISO format"),
        repeat_interval: z.number().optional().describe("New repeat interval"),
        repeat_multiplier: z
          .number()
          .optional()
          .describe("New repeat multiplier"),
        account_id: z.string().optional().describe("New account UUID"),
        reminder_days: z.number().optional().describe("New reminder days"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({
      schedule_id,
      start_date,
      next_date,
      repeat_interval,
      repeat_multiplier,
      account_id,
      reminder_days,
    }) => {
      const success = client.scheduledTransactions.update(schedule_id, {
        startDate: start_date,
        nextDate: next_date,
        repeatInterval: repeat_interval,
        repeatMultiplier: repeat_multiplier,
        accountId: account_id,
        reminderDays: reminder_days,
      });

      if (!success) {
        return errorResponse(
          "Scheduled transaction not found or no updates provided"
        );
      }

      const schedule = client.scheduledTransactions.get(schedule_id);
      return successResponse("Scheduled transaction updated successfully", {
        schedule,
      });
    }
  );

  server.registerTool(
    "delete_scheduled_transaction",
    {
      title: "Delete Scheduled Transaction",
      description: "Delete a scheduled transaction",
      inputSchema: {
        schedule_id: z
          .number()
          .describe("The scheduled transaction ID to delete"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ schedule_id }) => {
      const schedule = client.scheduledTransactions.get(schedule_id);
      if (!schedule) {
        return errorResponse(`Scheduled transaction not found: ${schedule_id}`);
      }

      client.scheduledTransactions.delete(schedule_id);
      return successResponse("Scheduled transaction deleted successfully", {
        deletedSchedule: schedule,
      });
    }
  );
}
