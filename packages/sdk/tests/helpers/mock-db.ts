import { vi } from "vitest";
import type Database from "better-sqlite3";

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
