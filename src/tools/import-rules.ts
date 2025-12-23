import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BanktivityDatabase } from "../database/index.js";
import { jsonResponse, errorResponse, successResponse } from "./helpers.js";

/**
 * Register import rule-related tools
 */
export function registerImportRuleTools(server: McpServer, db: BanktivityDatabase): void {
  server.registerTool(
    "list_import_rules",
    {
      title: "List Import Rules",
      description: "List all import rules (patterns to match and categorize imported transactions)",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const rules = db.importRules.getAll();
      return jsonResponse(rules);
    }
  );

  server.registerTool(
    "get_import_rule",
    {
      title: "Get Import Rule",
      description: "Get a specific import rule by ID",
      inputSchema: {
        rule_id: z.number().describe("The import rule ID"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ rule_id }) => {
      const rule = db.importRules.getById(rule_id);
      if (!rule) {
        return errorResponse(`Import rule not found: ${rule_id}`);
      }
      return jsonResponse(rule);
    }
  );

  server.registerTool(
    "create_import_rule",
    {
      title: "Create Import Rule",
      description: "Create a new import rule to automatically categorize imported transactions based on a regex pattern",
      inputSchema: {
        template_id: z.number().describe("The transaction template ID to apply when this rule matches"),
        pattern: z.string().describe("Regex pattern to match against transaction descriptions"),
        account_id: z.string().optional().describe("Optional account UUID to filter by"),
        payee: z.string().optional().describe("Optional payee name to set"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ template_id, pattern, account_id, payee }) => {
      // Validate regex pattern
      try {
        new RegExp(pattern);
      } catch {
        return errorResponse(`Invalid regex pattern: ${pattern}`);
      }

      const ruleId = db.importRules.create({
        templateId: template_id,
        pattern,
        accountId: account_id,
        payee,
      });

      const rule = db.importRules.getById(ruleId);
      return successResponse("Import rule created successfully", { ruleId, rule });
    }
  );

  server.registerTool(
    "update_import_rule",
    {
      title: "Update Import Rule",
      description: "Update an existing import rule",
      inputSchema: {
        rule_id: z.number().describe("The import rule ID to update"),
        pattern: z.string().optional().describe("New regex pattern"),
        account_id: z.string().optional().describe("New account UUID"),
        payee: z.string().optional().describe("New payee name"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ rule_id, pattern, account_id, payee }) => {
      if (pattern) {
        try {
          new RegExp(pattern);
        } catch {
          return errorResponse(`Invalid regex pattern: ${pattern}`);
        }
      }

      const success = db.importRules.update(rule_id, {
        pattern,
        accountId: account_id,
        payee,
      });

      if (!success) {
        return errorResponse("Import rule not found or no updates provided");
      }

      const rule = db.importRules.getById(rule_id);
      return successResponse("Import rule updated successfully", { rule });
    }
  );

  server.registerTool(
    "delete_import_rule",
    {
      title: "Delete Import Rule",
      description: "Delete an import rule",
      inputSchema: {
        rule_id: z.number().describe("The import rule ID to delete"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ rule_id }) => {
      const rule = db.importRules.getById(rule_id);
      if (!rule) {
        return errorResponse(`Import rule not found: ${rule_id}`);
      }

      db.importRules.delete(rule_id);
      return successResponse("Import rule deleted successfully", { deletedRule: rule });
    }
  );

  server.registerTool(
    "match_import_rules",
    {
      title: "Match Import Rules",
      description: "Test which import rules match a given transaction description",
      inputSchema: {
        description: z.string().describe("The transaction description to test against import rules"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ description }) => {
      const matches = db.importRules.matchDescription(description);
      return jsonResponse({
        description,
        matchCount: matches.length,
        matches,
      });
    }
  );
}
