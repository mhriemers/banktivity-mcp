/**
 * Base error class for Banktivity SDK errors
 */
export class BanktivityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BanktivityError";
  }
}

/**
 * Error thrown when Banktivity currency metadata is unavailable or invalid
 */
export class CurrencyMetadataError extends BanktivityError {
  constructor(message: string) {
    super(message);
    this.name = "CurrencyMetadataError";
  }
}

/**
 * Error thrown when an entity is not found
 */
export class NotFoundError extends BanktivityError {
  constructor(entity: string, id: number | string) {
    super(`${entity} not found: ${id}`);
    this.name = "NotFoundError";
  }
}

/**
 * Error thrown when input validation fails
 */
export class ValidationError extends BanktivityError {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
