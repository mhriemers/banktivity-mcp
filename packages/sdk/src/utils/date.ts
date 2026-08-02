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
 *
 * Banktivity stores date-only values as noon UTC. We extract the date
 * in UTC to avoid timezone-related off-by-one errors.
 */
export function coreDataToISO(timestamp: number): string {
  const unixTimestamp = timestamp + CORE_DATA_EPOCH_OFFSET;
  const date = new Date(unixTimestamp * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Convert ISO date string to Core Data timestamp
 *
 * Stores as noon UTC to match Banktivity's convention and avoid
 * off-by-one errors at day boundaries regardless of local timezone.
 * See: https://github.com/mhriemers/banktivity-mcp/issues/17
 */
export function isoToCoreData(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return Math.floor(date.getTime() / 1000) - CORE_DATA_EPOCH_OFFSET;
}
