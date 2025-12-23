#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BanktivityDatabase } from "./database/index.js";
import { registerAllTools } from "./tools/index.js";

const BANK_FILE_PATH = process.env.BANKTIVITY_FILE_PATH;

if (!BANK_FILE_PATH) {
  console.error("Error: BANKTIVITY_FILE_PATH environment variable is required");
  console.error("Set it to the path of your .bank8 file");
  process.exit(1);
}

const db = new BanktivityDatabase(BANK_FILE_PATH);

const server = new McpServer({
  name: "banktivity-mcp",
  version: "1.0.0",
});

// Register all tools
registerAllTools(server, db);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Banktivity MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
