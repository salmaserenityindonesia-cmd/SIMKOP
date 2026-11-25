/**
 * Fetches all rows from a Supabase/PostgREST query using `.range(from, to)`
 * pagination so results are never silently truncated at the 1,000-row limit.
 */
export async function fetchAllPaginated<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000
): Promise<T[]> {
  const results: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;

    results.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return results;
}

/**
 * Mock-safe pagination helper for Supabase/PostgREST queries.
 * When `.range()` is unavailable (e.g. in unit test mocks), awaits the query once.
 */
export async function fetchAllPaginatedSafe<T = any>(
  createQuery: () => any,
  pageSize = 1000
): Promise<{ data: T[]; error: any }> {
  const firstQuery = createQuery();
  if (!firstQuery) return { data: [], error: null };

  if (typeof firstQuery.range !== 'function') {
    const res = await firstQuery;
    return {
      data: Array.isArray(res?.data) ? (res.data as T[]) : [],
      error: res?.error ?? null,
    };
  }

  const allRows: T[] = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const q = from === 0 ? firstQuery : createQuery();
    const { data, error } = await q.range(from, to);
    if (error) {
      return { data: allRows, error };
    }
    if (!Array.isArray(data) || data.length === 0) break;
    allRows.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return { data: allRows, error: null };
}
