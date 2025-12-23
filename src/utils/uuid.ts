import { randomUUID } from "crypto";

/**
 * Generate a UUID for ZPUNIQUEID fields (uppercase format)
 */
export function generateUUID(): string {
  return randomUUID().toUpperCase();
}
