import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockReadFileSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
}));
const mockStatement = {
  get: vi.fn(),
};
const mockDbInstance = {
  prepare: vi.fn().mockReturnValue(mockStatement),
  close: vi.fn(),
};

vi.mock("better-sqlite3", () => {
  return {
    default: class MockDatabase {
      constructor() {
        return mockDbInstance;
      }
    },
  };
});

vi.mock("node:fs", () => ({
  readFileSync: mockReadFileSync,
}));

import { DatabaseConnection } from "../src/connection.js";

const validPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>displayCurrencyCode</key>
  <string>USD</string>
</dict>
</plist>`;

describe("DatabaseConnection default currency", () => {
  beforeEach(() => {
    mockReadFileSync.mockReset().mockReturnValue(validPlist);
    mockStatement.get.mockReset().mockImplementation((code?: string) => {
      if (code === "USD") return { id: 5 };
      return undefined;
    });
  });

  it("returns the currency configured in StoreAttributes.plist", () => {
    const connection = new DatabaseConnection("/path/to/file.bank8");

    expect(connection.getDefaultCurrencyId()).toBe(5);
    expect(mockStatement.get).toHaveBeenCalledWith("USD");
  });

  it("throws when StoreAttributes.plist cannot be read", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const connection = new DatabaseConnection("/path/to/file.bank8");

    expect(() => connection.getDefaultCurrencyId()).toThrow(
      "Unable to read StoreAttributes.plist"
    );
    expect(mockStatement.get).not.toHaveBeenCalled();
  });

  it("throws when StoreAttributes.plist has no supported currency key", () => {
    mockReadFileSync.mockReturnValue(
      "<?xml version=\"1.0\"?><plist><dict><key>creationDate</key><date>2026-01-01</date></dict></plist>"
    );
    const connection = new DatabaseConnection("/path/to/file.bank8");

    expect(() => connection.getDefaultCurrencyId()).toThrow(
      "does not contain a supported home currency"
    );
    expect(mockStatement.get).not.toHaveBeenCalled();
  });

  it("throws when the configured currency is absent from ZCURRENCY", () => {
    mockStatement.get.mockReturnValue(undefined);
    const connection = new DatabaseConnection("/path/to/file.bank8");

    expect(() => connection.getDefaultCurrencyId()).toThrow(
      "Configured currency USD was not found in ZCURRENCY"
    );
    expect(mockStatement.get).toHaveBeenCalledWith("USD");
    expect(mockStatement.get).toHaveBeenCalledTimes(1);
  });
});
