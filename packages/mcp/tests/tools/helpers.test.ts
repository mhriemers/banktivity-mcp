import { describe, it, expect, vi } from "vitest";
import {
  jsonResponse,
  errorResponse,
  successResponse,
  formatCurrency,
  resolveAccountId,
  resolveAccountIdOrError,
  isErrorResponse,
} from "../../src/tools/helpers.js";
import type { BanktivityClient } from "@mhriemers/banktivity-sdk";

describe("MCP helpers", () => {
  describe("jsonResponse", () => {
    it("should create response with stringified JSON content", () => {
      const data = { id: 1, name: "Test" };
      const response = jsonResponse(data);

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe("text");
      expect(JSON.parse(response.content[0].text)).toEqual(data);
    });

    it("should format JSON with indentation", () => {
      const data = { key: "value" };
      const response = jsonResponse(data);

      expect(response.content[0].text).toContain("\n");
    });

    it("should handle arrays", () => {
      const data = [{ id: 1 }, { id: 2 }];
      const response = jsonResponse(data);

      expect(JSON.parse(response.content[0].text)).toEqual(data);
    });

    it("should not have isError property", () => {
      const response = jsonResponse({ test: true });
      expect(response.isError).toBeUndefined();
    });
  });

  describe("errorResponse", () => {
    it("should create error response with message", () => {
      const response = errorResponse("Something went wrong");

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe("text");
      expect(response.content[0].text).toBe("Something went wrong");
      expect(response.isError).toBe(true);
    });
  });

  describe("successResponse", () => {
    it("should create response with message only", () => {
      const response = successResponse("Operation completed");
      const parsed = JSON.parse(response.content[0].text);

      expect(parsed.message).toBe("Operation completed");
    });

    it("should include additional data", () => {
      const response = successResponse("Created", { id: 123, name: "Test" });
      const parsed = JSON.parse(response.content[0].text);

      expect(parsed.message).toBe("Created");
      expect(parsed.id).toBe(123);
      expect(parsed.name).toBe("Test");
    });
  });

  describe("formatCurrency", () => {
    it("should format EUR by default", () => {
      const formatted = formatCurrency(1234.56);
      expect(formatted).toContain("1.234,56");
      expect(formatted).toContain("€");
    });

    it("should format specified currency", () => {
      const formatted = formatCurrency(1000, "USD");
      expect(formatted).toContain("US$");
    });

    it("should handle negative amounts", () => {
      const formatted = formatCurrency(-500);
      expect(formatted).toContain("-");
      expect(formatted).toContain("500");
    });
  });

  describe("resolveAccountId", () => {
    it("should return accountId if provided", () => {
      const mockClient = {} as BanktivityClient;
      const result = resolveAccountId(mockClient, 123);
      expect(result).toBe(123);
    });

    it("should lookup account by name if id not provided", () => {
      const mockClient = {
        accounts: {
          findByName: vi.fn().mockReturnValue({ id: 456 }),
        },
      } as unknown as BanktivityClient;

      const result = resolveAccountId(mockClient, undefined, "Checking");

      expect(result).toBe(456);
      expect(mockClient.accounts.findByName).toHaveBeenCalledWith("Checking");
    });

    it("should return null if account not found by name", () => {
      const mockClient = {
        accounts: {
          findByName: vi.fn().mockReturnValue(null),
        },
      } as unknown as BanktivityClient;

      const result = resolveAccountId(mockClient, undefined, "Unknown");

      expect(result).toBeNull();
    });

    it("should return null if neither id nor name provided", () => {
      const mockClient = {} as BanktivityClient;
      const result = resolveAccountId(mockClient);
      expect(result).toBeNull();
    });

    it("should prefer id over name", () => {
      const mockClient = {
        accounts: {
          findByName: vi.fn(),
        },
      } as unknown as BanktivityClient;

      const result = resolveAccountId(mockClient, 123, "Checking");

      expect(result).toBe(123);
      expect(mockClient.accounts.findByName).not.toHaveBeenCalled();
    });
  });

  describe("resolveAccountIdOrError", () => {
    it("should return id if resolved", () => {
      const mockClient = {} as BanktivityClient;
      const result = resolveAccountIdOrError(mockClient, 123);
      expect(result).toBe(123);
    });

    it("should return error if account name not found", () => {
      const mockClient = {
        accounts: {
          findByName: vi.fn().mockReturnValue(null),
        },
      } as unknown as BanktivityClient;

      const result = resolveAccountIdOrError(mockClient, undefined, "Unknown");

      expect(typeof result).toBe("object");
      expect((result as any).isError).toBe(true);
      expect((result as any).content[0].text).toContain("Account not found");
    });

    it("should return error if neither id nor name provided", () => {
      const mockClient = {} as BanktivityClient;
      const result = resolveAccountIdOrError(mockClient);

      expect(typeof result).toBe("object");
      expect((result as any).isError).toBe(true);
      expect((result as any).content[0].text).toContain("required");
    });
  });

  describe("isErrorResponse", () => {
    it("should return true for error response", () => {
      const response = errorResponse("Error");
      expect(isErrorResponse(response)).toBe(true);
    });

    it("should return false for success response", () => {
      const response = jsonResponse({ data: true });
      expect(isErrorResponse(response)).toBe(false);
    });

    it("should return false for non-object values", () => {
      expect(isErrorResponse(null)).toBe(false);
      expect(isErrorResponse(undefined)).toBe(false);
      expect(isErrorResponse("string")).toBe(false);
      expect(isErrorResponse(123)).toBe(false);
    });

    it("should return false for objects without isError", () => {
      expect(isErrorResponse({ content: [] })).toBe(false);
    });

    it("should return false for objects with isError=false", () => {
      expect(isErrorResponse({ isError: false })).toBe(false);
    });
  });
});
