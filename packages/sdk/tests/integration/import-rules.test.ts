import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createTestDatabase, seedTestDatabase, type TestData } from "./test-db.js";
import { ImportRuleRepository } from "../../src/repositories/import-rules.js";
import { TransactionTemplateRepository } from "../../src/repositories/templates.js";

describe("Import Rule Integration Tests", () => {
  let db: Database.Database;
  let testData: TestData;
  let importRuleRepo: ImportRuleRepository;
  let templateRepo: TransactionTemplateRepository;
  let templateId: number;

  beforeEach(() => {
    db = createTestDatabase();
    testData = seedTestDatabase(db);
    importRuleRepo = new ImportRuleRepository(db);
    templateRepo = new TransactionTemplateRepository(db);

    // Create a template for testing
    templateId = templateRepo.create({
      title: "Grocery Template",
      amount: 100,
    });
  });

  afterEach(() => {
    db.close();
  });

  describe("list rules", () => {
    it("should return empty array when no rules exist", () => {
      const rules = importRuleRepo.list();
      expect(rules).toEqual([]);
    });

    it("should list all rules ordered by template title", () => {
      const template2 = templateRepo.create({ title: "Amazon", amount: 50 });
      const template3 = templateRepo.create({ title: "Starbucks", amount: 5 });

      importRuleRepo.create({ templateId, pattern: "GROCERY" });
      importRuleRepo.create({ templateId: template2, pattern: "AMAZON" });
      importRuleRepo.create({ templateId: template3, pattern: "STARBUCKS" });

      const rules = importRuleRepo.list();

      expect(rules).toHaveLength(3);
      expect(rules[0].templateTitle).toBe("Amazon");
      expect(rules[1].templateTitle).toBe("Grocery Template");
      expect(rules[2].templateTitle).toBe("Starbucks");
    });
  });

  describe("get rule", () => {
    it("should get rule by id", () => {
      const id = importRuleRepo.create({
        templateId,
        pattern: "WALMART|COSTCO",
        accountId: "ACC-123",
        payee: "Grocery Store",
      });

      const rule = importRuleRepo.get(id);

      expect(rule).not.toBeNull();
      expect(rule!.templateId).toBe(templateId);
      expect(rule!.templateTitle).toBe("Grocery Template");
      expect(rule!.pattern).toBe("WALMART|COSTCO");
      expect(rule!.accountId).toBe("ACC-123");
      expect(rule!.payee).toBe("Grocery Store");
    });

    it("should return null for non-existent rule", () => {
      const rule = importRuleRepo.get(99999);
      expect(rule).toBeNull();
    });
  });

  describe("create rule", () => {
    it("should create basic rule", () => {
      const id = importRuleRepo.create({
        templateId,
        pattern: "COFFEE",
      });

      expect(id).toBeGreaterThan(0);

      const rule = importRuleRepo.get(id);
      expect(rule!.pattern).toBe("COFFEE");
      expect(rule!.accountId).toBeNull();
      expect(rule!.payee).toBeNull();
    });

    it("should create rule with account and payee", () => {
      const id = importRuleRepo.create({
        templateId,
        pattern: "NETFLIX",
        accountId: "STREAMING-ACC",
        payee: "Netflix Inc",
      });

      const rule = importRuleRepo.get(id);
      expect(rule!.accountId).toBe("STREAMING-ACC");
      expect(rule!.payee).toBe("Netflix Inc");
    });
  });

  describe("update rule", () => {
    it("should update pattern", () => {
      const id = importRuleRepo.create({ templateId, pattern: "OLD" });

      const updated = importRuleRepo.update(id, { pattern: "NEW|PATTERN" });

      expect(updated).toBe(true);
      expect(importRuleRepo.get(id)!.pattern).toBe("NEW|PATTERN");
    });

    it("should update account and payee", () => {
      const id = importRuleRepo.create({ templateId, pattern: "TEST" });

      importRuleRepo.update(id, {
        accountId: "NEW-ACC",
        payee: "New Payee",
      });

      const rule = importRuleRepo.get(id);
      expect(rule!.accountId).toBe("NEW-ACC");
      expect(rule!.payee).toBe("New Payee");
    });

    it("should return false for non-existent rule", () => {
      const updated = importRuleRepo.update(99999, { pattern: "X" });
      expect(updated).toBe(false);
    });
  });

  describe("delete rule", () => {
    it("should delete rule", () => {
      const id = importRuleRepo.create({ templateId, pattern: "DELETE" });
      expect(importRuleRepo.get(id)).not.toBeNull();

      const deleted = importRuleRepo.delete(id);

      expect(deleted).toBe(true);
      expect(importRuleRepo.get(id)).toBeNull();
    });

    it("should return false for non-existent rule", () => {
      const deleted = importRuleRepo.delete(99999);
      expect(deleted).toBe(false);
    });
  });

  describe("match rules", () => {
    beforeEach(() => {
      const template2 = templateRepo.create({ title: "Amazon", amount: 50 });
      const template3 = templateRepo.create({ title: "Coffee", amount: 5 });

      importRuleRepo.create({ templateId, pattern: "WALMART|TARGET|COSTCO" });
      importRuleRepo.create({ templateId: template2, pattern: "AMZN|AMAZON" });
      importRuleRepo.create({ templateId: template3, pattern: "STARBUCKS|DUNKIN" });
    });

    it("should match single rule", () => {
      const matches = importRuleRepo.match("AMAZON MARKETPLACE");

      expect(matches).toHaveLength(1);
      expect(matches[0].templateTitle).toBe("Amazon");
    });

    it("should match with case insensitivity", () => {
      const matches = importRuleRepo.match("purchase at walmart");

      expect(matches).toHaveLength(1);
      expect(matches[0].templateTitle).toBe("Grocery Template");
    });

    it("should match multiple rules", () => {
      // Create overlapping rule
      const multiTemplate = templateRepo.create({ title: "Multi", amount: 10 });
      importRuleRepo.create({ templateId: multiTemplate, pattern: "AMAZON" });

      const matches = importRuleRepo.match("AMAZON");

      expect(matches).toHaveLength(2);
    });

    it("should return empty array when no match", () => {
      const matches = importRuleRepo.match("RANDOM MERCHANT");

      expect(matches).toEqual([]);
    });

    it("should handle regex patterns", () => {
      const regexTemplate = templateRepo.create({ title: "Regex", amount: 25 });
      importRuleRepo.create({ templateId: regexTemplate, pattern: "^PAYMENT.*\\d{4}$" });

      const matches = importRuleRepo.match("PAYMENT REFERENCE 1234");

      expect(matches).toHaveLength(1);
      expect(matches[0].templateTitle).toBe("Regex");
    });

    it("should skip invalid regex patterns gracefully", () => {
      // Create rule with invalid regex
      const badTemplate = templateRepo.create({ title: "Bad", amount: 1 });
      importRuleRepo.create({ templateId: badTemplate, pattern: "[invalid(regex" });

      // Should not throw
      const matches = importRuleRepo.match("test");
      expect(Array.isArray(matches)).toBe(true);
    });
  });
});
