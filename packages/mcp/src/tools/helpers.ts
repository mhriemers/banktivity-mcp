import { BanktivityClient } from "@mhriemers/banktivity-sdk";

/**
 * Tool response types - uses index signature for MCP SDK compatibility
 */
export interface ToolResponse {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/**
 * Create a successful JSON response
 */
export function jsonResponse(data: unknown): ToolResponse {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Create an error response
 */
export function errorResponse(message: string): ToolResponse {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

/**
 * Create a success message response with optional data
 */
export function successResponse(
  message: string,
  data?: Record<string, unknown>
): ToolResponse {
  return jsonResponse({
    message,
    ...data,
  });
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currency = "EUR"): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency,
  }).format(amount);
}

/**
 * Resolve account ID from either ID or name
 * @returns Account ID or null if not found
 */
export function resolveAccountId(
  client: BanktivityClient,
  accountId?: number,
  accountName?: string
): number | null {
  if (accountId) {
    return accountId;
  }

  if (accountName) {
    const account = client.accounts.findByName(accountName);
    return account?.id ?? null;
  }

  return null;
}

/**
 * Resolve account ID with error handling
 * @returns Account ID or error response
 */
export function resolveAccountIdOrError(
  client: BanktivityClient,
  accountId?: number,
  accountName?: string
): number | ToolResponse {
  const id = resolveAccountId(client, accountId, accountName);

  if (id === null) {
    if (accountName) {
      return errorResponse(`Account not found: ${accountName}`);
    }
    return errorResponse("Either account_id or account_name is required");
  }

  return id;
}

/**
 * Helper to check if a value is an error response
 */
export function isErrorResponse(value: unknown): value is ToolResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "isError" in value &&
    (value as ToolResponse).isError === true
  );
}
