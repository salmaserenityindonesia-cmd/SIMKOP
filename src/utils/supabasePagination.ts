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
