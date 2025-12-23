import { describe, it, expect } from "vitest";
import {
  BanktivityError,
  NotFoundError,
  ValidationError,
} from "../src/errors.js";

describe("errors", () => {
  describe("BanktivityError", () => {
    it("should create error with message", () => {
      const error = new BanktivityError("Test error");
      expect(error.message).toBe("Test error");
      expect(error.name).toBe("BanktivityError");
    });

    it("should be instance of Error", () => {
      const error = new BanktivityError("Test");
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BanktivityError);
    });
  });

  describe("NotFoundError", () => {
    it("should create error with entity and numeric id", () => {
      const error = new NotFoundError("Account", 123);
      expect(error.message).toBe("Account not found: 123");
      expect(error.name).toBe("NotFoundError");
    });

    it("should create error with entity and string id", () => {
      const error = new NotFoundError("Tag", "shopping");
      expect(error.message).toBe("Tag not found: shopping");
    });

    it("should be instance of BanktivityError", () => {
      const error = new NotFoundError("Entity", 1);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BanktivityError);
      expect(error).toBeInstanceOf(NotFoundError);
    });
  });

  describe("ValidationError", () => {
    it("should create error with message", () => {
      const error = new ValidationError("Invalid amount");
      expect(error.message).toBe("Invalid amount");
      expect(error.name).toBe("ValidationError");
    });

    it("should be instance of BanktivityError", () => {
      const error = new ValidationError("Invalid");
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BanktivityError);
      expect(error).toBeInstanceOf(ValidationError);
    });
  });
});
