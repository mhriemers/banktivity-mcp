/**
 * SQL query building utilities for dynamic updates
 */

export interface UpdateClause {
  sql: string;
  params: (string | number | null)[];
}

/**
 * Build a dynamic UPDATE query from a partial updates object
 * @param updates - Object with optional fields to update
 * @param columnMap - Mapping from update field names to SQL column names
 * @returns UpdateClause with SET portion and parameters, or null if no updates
 */
export function buildUpdateClauses(
  updates: object,
  columnMap: Record<string, string>
): UpdateClause | null {
  const setClauses: string[] = [];
  const params: (string | number | null)[] = [];
  const updatesRecord = updates as Record<string, unknown>;

  for (const [field, column] of Object.entries(columnMap)) {
    const value = updatesRecord[field];
    if (value !== undefined) {
      setClauses.push(`${column} = ?`);
      params.push(value as string | number | null);
    }
  }

  if (setClauses.length === 0) {
    return null;
  }

  return {
    sql: setClauses.join(", "),
    params,
  };
}

/**
 * Build WHERE conditions from optional filter parameters
 */
export function buildWhereConditions(
  filters: object,
  columnMap: Record<string, string>
): { conditions: string[]; params: (string | number)[] } {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  const filtersRecord = filters as Record<string, unknown>;

  for (const [field, column] of Object.entries(columnMap)) {
    const value = filtersRecord[field];
    if (value !== undefined && value !== null) {
      conditions.push(`${column} = ?`);
      params.push(value as string | number);
    }
  }

  return { conditions, params };
}
