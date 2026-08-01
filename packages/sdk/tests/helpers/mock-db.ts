import { vi } from "vitest";
import type Database from "better-sqlite3";
import type { EntityTypes } from "../../src/connection.js";

/**
 * Default mock entity types for unit testing.
 * Uses the same values seeded in the integration test Z_PRIMARYKEY table.
 */
export const mockEntityTypes: EntityTypes = {
  Account: 1,
  Category: 2,
  PrimaryAccount: 3,
  LineItem: 19,
  LineItemTemplate: 21,
  Payee: 31,
  PayeeInfo: 33,
  RecurringTransaction: 35,
  Tag: 47,
  TemplateSelector: 48,
  ImportSourceTemplateSelector: 49,
  ScheduledTemplateSelector: 52,
  Transaction: 53,
  TransactionTemplate: 54,
  TransactionType: 55,
};

export const mockTagJunctionColumn = `Z_${mockEntityTypes.Tag}PTAGS`;

export interface MockStatement {
  all: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
}

export interface MockDatabase {
  prepare: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

export function createMockStatement(overrides: Partial<MockStatement> = {}): MockStatement {
  return {
    all: vi.fn().mockReturnValue([]),
    get: vi.fn().mockReturnValue(undefined),
    run: vi.fn().mockReturnValue({ changes: 0, lastInsertRowid: 0 }),
    ...overrides,
  };
}

export function createMockDatabase(overrides: Partial<MockDatabase> = {}): MockDatabase {
  const mockStatement = createMockStatement();
  return {
    prepare: vi.fn().mockReturnValue(mockStatement),
    transaction: vi.fn((fn) => fn),
    close: vi.fn(),
    ...overrides,
  };
}

export function asDatabaseInstance(mock: MockDatabase): Database.Database {
  return mock as unknown as Database.Database;
}
