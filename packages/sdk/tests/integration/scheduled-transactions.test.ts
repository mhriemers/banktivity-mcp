import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createTestDatabase, seedTestDatabase, type TestData } from "./test-db.js";
import { ScheduledTransactionRepository } from "../../src/repositories/scheduled-transactions.js";
import { TransactionTemplateRepository } from "../../src/repositories/templates.js";

describe("Scheduled Transaction Integration Tests", () => {
  let db: Database.Database;
  let testData: TestData;
  let scheduleRepo: ScheduledTransactionRepository;
  let templateRepo: TransactionTemplateRepository;
  let templateId: number;

  beforeEach(() => {
    db = createTestDatabase();
    testData = seedTestDatabase(db);
    scheduleRepo = new ScheduledTransactionRepository(db);
    templateRepo = new TransactionTemplateRepository(db);

    // Create a template for testing
    templateId = templateRepo.create({
      title: "Monthly Rent",
      amount: 1500,
    });
  });

  afterEach(() => {
    db.close();
  });

  describe("list schedules", () => {
    it("should return empty array when no schedules exist", () => {
      const schedules = scheduleRepo.list();
      expect(schedules).toEqual([]);
    });

    it("should list all schedules ordered by start date", () => {
      const template2 = templateRepo.create({ title: "Later", amount: 100 });
      const template3 = templateRepo.create({ title: "Earlier", amount: 50 });

      scheduleRepo.create({ templateId, startDate: "2024-02-01" });
      scheduleRepo.create({ templateId: template2, startDate: "2024-03-01" });
      scheduleRepo.create({ templateId: template3, startDate: "2024-01-01" });

      const schedules = scheduleRepo.list();

      expect(schedules).toHaveLength(3);
      expect(schedules[0].startDate).toBe("2024-01-01");
      expect(schedules[1].startDate).toBe("2024-02-01");
      expect(schedules[2].startDate).toBe("2024-03-01");
    });
  });

  describe("get schedule", () => {
    it("should get schedule by id", () => {
      const id = scheduleRepo.create({
        templateId,
        startDate: "2024-01-15",
        accountId: "ACC-123",
        repeatInterval: 1,
        repeatMultiplier: 1,
        reminderDays: 3,
      });

      const schedule = scheduleRepo.get(id);

      expect(schedule).not.toBeNull();
      expect(schedule!.templateId).toBe(templateId);
      expect(schedule!.templateTitle).toBe("Monthly Rent");
      expect(schedule!.amount).toBe(1500);
      expect(schedule!.startDate).toBe("2024-01-15");
      expect(schedule!.nextDate).toBe("2024-01-15");
      expect(schedule!.accountId).toBe("ACC-123");
      expect(schedule!.repeatInterval).toBe(1);
      expect(schedule!.repeatMultiplier).toBe(1);
      expect(schedule!.reminderDays).toBe(3);
    });

    it("should return null for non-existent schedule", () => {
      const schedule = scheduleRepo.get(99999);
      expect(schedule).toBeNull();
    });
  });

  describe("create schedule", () => {
    it("should create basic schedule", () => {
      const id = scheduleRepo.create({
        templateId,
        startDate: "2024-06-01",
      });

      expect(id).toBeGreaterThan(0);

      const schedule = scheduleRepo.get(id);
      expect(schedule!.startDate).toBe("2024-06-01");
      expect(schedule!.nextDate).toBe("2024-06-01");
      expect(schedule!.repeatInterval).toBe(1);
      expect(schedule!.repeatMultiplier).toBe(1);
      expect(schedule!.reminderDays).toBe(7);
    });

    it("should create schedule with repeat settings", () => {
      const id = scheduleRepo.create({
        templateId,
        startDate: "2024-01-01",
        repeatInterval: 2,
        repeatMultiplier: 4,
      });

      const schedule = scheduleRepo.get(id);
      expect(schedule!.repeatInterval).toBe(2);
      expect(schedule!.repeatMultiplier).toBe(4);
    });

    it("should create schedule with account", () => {
      const id = scheduleRepo.create({
        templateId,
        startDate: "2024-01-01",
        accountId: "CHECKING-001",
      });

      const schedule = scheduleRepo.get(id);
      expect(schedule!.accountId).toBe("CHECKING-001");
    });

    it("should create schedule with custom reminder", () => {
      const id = scheduleRepo.create({
        templateId,
        startDate: "2024-01-01",
        reminderDays: 14,
      });

      const schedule = scheduleRepo.get(id);
      expect(schedule!.reminderDays).toBe(14);
    });

    it("should create recurring transaction record", () => {
      const id = scheduleRepo.create({
        templateId,
        startDate: "2024-01-01",
      });

      const schedule = scheduleRepo.get(id);
      expect(schedule!.recurringTransactionId).not.toBeNull();
    });
  });

  describe("update schedule", () => {
    it("should update start date", () => {
      const id = scheduleRepo.create({ templateId, startDate: "2024-01-01" });

      const updated = scheduleRepo.update(id, { startDate: "2024-02-01" });

      expect(updated).toBe(true);
      expect(scheduleRepo.get(id)!.startDate).toBe("2024-02-01");
    });

    it("should update next date", () => {
      const id = scheduleRepo.create({ templateId, startDate: "2024-01-01" });

      scheduleRepo.update(id, { nextDate: "2024-03-15" });

      expect(scheduleRepo.get(id)!.nextDate).toBe("2024-03-15");
    });

    it("should update repeat settings", () => {
      const id = scheduleRepo.create({ templateId, startDate: "2024-01-01" });

      scheduleRepo.update(id, {
        repeatInterval: 3,
        repeatMultiplier: 2,
      });

      const schedule = scheduleRepo.get(id);
      expect(schedule!.repeatInterval).toBe(3);
      expect(schedule!.repeatMultiplier).toBe(2);
    });

    it("should update account", () => {
      const id = scheduleRepo.create({ templateId, startDate: "2024-01-01" });

      scheduleRepo.update(id, { accountId: "NEW-ACC" });

      expect(scheduleRepo.get(id)!.accountId).toBe("NEW-ACC");
    });

    it("should update reminder days", () => {
      const id = scheduleRepo.create({ templateId, startDate: "2024-01-01" });

      scheduleRepo.update(id, { reminderDays: 30 });

      expect(scheduleRepo.get(id)!.reminderDays).toBe(30);
    });

    it("should return false for non-existent schedule", () => {
      const updated = scheduleRepo.update(99999, { reminderDays: 5 });
      expect(updated).toBe(false);
    });
  });

  describe("delete schedule", () => {
    it("should delete schedule and recurring transaction", () => {
      const id = scheduleRepo.create({ templateId, startDate: "2024-01-01" });
      const schedule = scheduleRepo.get(id);
      expect(schedule).not.toBeNull();

      const deleted = scheduleRepo.delete(id);

      expect(deleted).toBe(true);
      expect(scheduleRepo.get(id)).toBeNull();

      // Verify recurring transaction was also deleted
      const recurring = db
        .prepare("SELECT * FROM ZRECURRINGTRANSACTION WHERE Z_PK = ?")
        .get(schedule!.recurringTransactionId);
      expect(recurring).toBeUndefined();
    });

    it("should return false for non-existent schedule", () => {
      const deleted = scheduleRepo.delete(99999);
      expect(deleted).toBe(false);
    });
  });
});
