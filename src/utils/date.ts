/**
 * Core Data date utilities
 * Core Data uses 2001-01-01 as epoch, which is 978307200 seconds after Unix epoch
 */

const CORE_DATA_EPOCH_OFFSET = 978307200;

/**
 * Get current timestamp in Core Data format
 */
export function nowAsCoreData(): number {
  return Math.floor(Date.now() / 1000) - CORE_DATA_EPOCH_OFFSET;
}

/**
 * Convert Core Data timestamp to ISO date string (YYYY-MM-DD)
 */
export function coreDataToISO(timestamp: number): string {
  const unixTimestamp = timestamp + CORE_DATA_EPOCH_OFFSET;
  return new Date(unixTimestamp * 1000).toISOString().split("T")[0];
}

/**
 * Convert ISO date string to Core Data timestamp
 */
export function isoToCoreData(isoDate: string): number {
  const date = new Date(isoDate);
  return Math.floor(date.getTime() / 1000) - CORE_DATA_EPOCH_OFFSET;
}
