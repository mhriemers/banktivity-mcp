import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BanktivityDatabase } from "../database/index.js";

import { registerAccountTools } from "./accounts.js";
import { registerTransactionTools } from "./transactions.js";
import { registerLineItemTools } from "./line-items.js";
import { registerTagTools } from "./tags.js";
import { registerPayeeTools } from "./payees.js";
import { registerTemplateTools } from "./templates.js";
import { registerImportRuleTools } from "./import-rules.js";
import { registerScheduledTransactionTools } from "./scheduled-transactions.js";

/**
 * Register all tools with the MCP server
 */
export function registerAllTools(server: McpServer, db: BanktivityDatabase): void {
  registerAccountTools(server, db);
  registerTransactionTools(server, db);
  registerLineItemTools(server, db);
  registerTagTools(server, db);
  registerPayeeTools(server, db);
  registerTemplateTools(server, db);
  registerImportRuleTools(server, db);
  registerScheduledTransactionTools(server, db);
}

// Re-export for convenience
export * from "./helpers.js";
