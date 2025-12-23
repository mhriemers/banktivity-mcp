import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BanktivityClient } from "banktivity-sdk";

import { registerAccountTools } from "./accounts.js";
import { registerTransactionTools } from "./transactions.js";
import { registerLineItemTools } from "./line-items.js";
import { registerTagTools } from "./tags.js";
import { registerTemplateTools } from "./templates.js";
import { registerImportRuleTools } from "./import-rules.js";
import { registerScheduledTransactionTools } from "./scheduled-transactions.js";

/**
 * Register all tools with the MCP server
 */
export function registerAllTools(
  server: McpServer,
  client: BanktivityClient
): void {
  registerAccountTools(server, client);
  registerTransactionTools(server, client);
  registerLineItemTools(server, client);
  registerTagTools(server, client);
  registerTemplateTools(server, client);
  registerImportRuleTools(server, client);
  registerScheduledTransactionTools(server, client);
}

// Re-export for convenience
export * from "./helpers.js";
