import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createTestDatabase, seedTestDatabase, type TestData } from "./test-db.js";
import { TransactionTemplateRepository } from "../../src/repositories/templates.js";

describe("Transaction Template Integration Tests", () => {
  let db: Database.Database;
  let testData: TestData;
  let templateRepo: TransactionTemplateRepository;

  beforeEach(() => {
    db = createTestDatabase();
    testData = seedTestDatabase(db);
    templateRepo = new TransactionTemplateRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("list templates", () => {
    it("should return empty array when no templates exist", () => {
      const templates = templateRepo.list();
      expect(templates).toEqual([]);
    });

    it("should list all templates ordered by title", () => {
      templateRepo.create({ title: "Zebra", amount: 100 });
      templateRepo.create({ title: "Apple", amount: 200 });
      templateRepo.create({ title: "Mango", amount: 150 });

      const templates = templateRepo.list();

      expect(templates).toHaveLength(3);
      expect(templates[0].title).toBe("Apple");
      expect(templates[1].title).toBe("Mango");
      expect(templates[2].title).toBe("Zebra");
    });
  });

  describe("get template", () => {
    it("should get template by id", () => {
      const id = templateRepo.create({
        title: "Monthly Rent",
        amount: 1500,
        note: "Apartment rent",
      });

      const template = templateRepo.get(id);

      expect(template).not.toBeNull();
      expect(template!.title).toBe("Monthly Rent");
      expect(template!.amount).toBe(1500);
      expect(template!.note).toBe("Apartment rent");
      expect(template!.active).toBe(true);
      expect(template!.fixedAmount).toBe(true);
    });

    it("should return null for non-existent template", () => {
      const template = templateRepo.get(99999);
      expect(template).toBeNull();
    });
  });

  describe("create template", () => {
    it("should create basic template", () => {
      const id = templateRepo.create({
        title: "Coffee",
        amount: 5.50,
      });

      expect(id).toBeGreaterThan(0);

      const template = templateRepo.get(id);
      expect(template!.title).toBe("Coffee");
      expect(template!.amount).toBe(5.50);
      expect(template!.active).toBe(true);
    });

    it("should create template with note and currency", () => {
      const id = templateRepo.create({
        title: "Subscription",
        amount: 9.99,
        note: "Monthly subscription",
        currencyId: "USD",
      });

      const template = templateRepo.get(id);
      expect(template!.note).toBe("Monthly subscription");
      expect(template!.currencyId).toBe("USD");
    });

    it("should create template with line items", () => {
      const id = templateRepo.create({
        title: "Split Transaction",
        amount: 100,
        lineItems: [
          { accountId: "ACC-001", amount: -100, memo: "Debit" },
          { accountId: "ACC-002", amount: 60 },
          { accountId: "ACC-003", amount: 40 },
        ],
      });

      const template = templateRepo.get(id);
      expect(template!.lineItems).toHaveLength(3);
      expect(template!.lineItems[0].accountId).toBe("ACC-001");
      expect(template!.lineItems[0].amount).toBe(-100);
      expect(template!.lineItems[0].memo).toBe("Debit");
    });
  });

  describe("update template", () => {
    it("should update template title", () => {
      const id = templateRepo.create({ title: "Old Title", amount: 100 });

      const updated = templateRepo.update(id, { title: "New Title" });

      expect(updated).toBe(true);
      expect(templateRepo.get(id)!.title).toBe("New Title");
    });

    it("should update template amount", () => {
      const id = templateRepo.create({ title: "Test", amount: 100 });

      templateRepo.update(id, { amount: 200 });

      expect(templateRepo.get(id)!.amount).toBe(200);
    });

    it("should update template note", () => {
      const id = templateRepo.create({ title: "Test", amount: 100 });

      templateRepo.update(id, { note: "Updated note" });

      expect(templateRepo.get(id)!.note).toBe("Updated note");
    });

    it("should deactivate template", () => {
      const id = templateRepo.create({ title: "Test", amount: 100 });
      expect(templateRepo.get(id)!.active).toBe(true);

      templateRepo.update(id, { active: false });

      expect(templateRepo.get(id)!.active).toBe(false);
    });

    it("should reactivate template", () => {
      const id = templateRepo.create({ title: "Test", amount: 100 });
      templateRepo.update(id, { active: false });

      templateRepo.update(id, { active: true });

      expect(templateRepo.get(id)!.active).toBe(true);
    });

    it("should return false for non-existent template", () => {
      const updated = templateRepo.update(99999, { title: "New" });
      expect(updated).toBe(false);
    });
  });

  describe("delete template", () => {
    it("should delete template", () => {
      const id = templateRepo.create({ title: "To Delete", amount: 50 });
      expect(templateRepo.get(id)).not.toBeNull();

      const deleted = templateRepo.delete(id);

      expect(deleted).toBe(true);
      expect(templateRepo.get(id)).toBeNull();
    });

    it("should delete template with line items", () => {
      const id = templateRepo.create({
        title: "With Items",
        amount: 100,
        lineItems: [
          { accountId: "ACC-1", amount: 100 },
          { accountId: "ACC-2", amount: -100 },
        ],
      });

      templateRepo.delete(id);

      expect(templateRepo.get(id)).toBeNull();
    });
  });
});
