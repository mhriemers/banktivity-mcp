import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BanktivityDatabase } from "../database/index.js";
import { jsonResponse, errorResponse, successResponse } from "./helpers.js";

/**
 * Register payee-related tools
 */
export function registerPayeeTools(server: McpServer, db: BanktivityDatabase): void {
  server.registerTool(
    "list_payees",
    {
      title: "List Payees",
      description: "List all payees with their contact information",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const payees = db.payees.getAll();
      return jsonResponse(payees);
    }
  );

  server.registerTool(
    "get_payee",
    {
      title: "Get Payee",
      description: "Get a specific payee by ID",
      inputSchema: {
        payee_id: z.number().describe("The payee ID"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ payee_id }) => {
      const payee = db.payees.getById(payee_id);
      if (!payee) {
        return errorResponse(`Payee not found: ${payee_id}`);
      }
      return jsonResponse(payee);
    }
  );

  server.registerTool(
    "create_payee",
    {
      title: "Create Payee",
      description: "Create a new payee with optional contact information",
      inputSchema: {
        name: z.string().describe("The payee name"),
        phone: z.string().optional().describe("Phone number"),
        street1: z.string().optional().describe("Street address line 1"),
        street2: z.string().optional().describe("Street address line 2"),
        street3: z.string().optional().describe("Street address line 3"),
        city: z.string().optional().describe("City"),
        state: z.string().optional().describe("State/Province"),
        postal_code: z.string().optional().describe("Postal/ZIP code"),
        country_code: z.string().optional().describe("Country code (e.g., 'US', 'NL')"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ name, phone, street1, street2, street3, city, state, postal_code, country_code }) => {
      const payeeId = db.payees.create({
        name,
        phone,
        street1,
        street2,
        street3,
        city,
        state,
        postalCode: postal_code,
        countryCode: country_code,
      });

      const payee = db.payees.getById(payeeId);

      return successResponse("Payee created successfully", { payeeId, payee });
    }
  );

  server.registerTool(
    "update_payee",
    {
      title: "Update Payee",
      description: "Update an existing payee's information",
      inputSchema: {
        payee_id: z.number().describe("The payee ID to update"),
        name: z.string().optional().describe("New name"),
        phone: z.string().optional().describe("New phone number"),
        street1: z.string().optional().describe("New street address line 1"),
        street2: z.string().optional().describe("New street address line 2"),
        street3: z.string().optional().describe("New street address line 3"),
        city: z.string().optional().describe("New city"),
        state: z.string().optional().describe("New state/province"),
        postal_code: z.string().optional().describe("New postal/ZIP code"),
        country_code: z.string().optional().describe("New country code"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ payee_id, name, phone, street1, street2, street3, city, state, postal_code, country_code }) => {
      const success = db.payees.update(payee_id, {
        name,
        phone,
        street1,
        street2,
        street3,
        city,
        state,
        postalCode: postal_code,
        countryCode: country_code,
      });

      if (!success) {
        return errorResponse("Payee not found or no updates provided");
      }

      const payee = db.payees.getById(payee_id);
      return successResponse("Payee updated successfully", { payee });
    }
  );

  server.registerTool(
    "delete_payee",
    {
      title: "Delete Payee",
      description: "Delete a payee",
      inputSchema: {
        payee_id: z.number().describe("The payee ID to delete"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ payee_id }) => {
      const payee = db.payees.getById(payee_id);
      if (!payee) {
        return errorResponse(`Payee not found: ${payee_id}`);
      }

      db.payees.delete(payee_id);
      return successResponse("Payee deleted successfully", { deletedPayee: payee });
    }
  );
}
