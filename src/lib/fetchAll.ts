/**
 * Page through a PostgREST query to bypass the server's 1000-row response cap.
 *
 * Usage:
 *   const rows = await fetchAllRows((from, to) =>
 *     supabase.from('driver_wallets').select('driver_id, balance')
 *       .order('driver_id').range(from, to),
 *   );
 *
 * The callback MUST apply a stable ORDER BY so consecutive .range() pages
 * never overlap or skip rows.
 */
export const FETCH_ALL_PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += FETCH_ALL_PAGE_SIZE) {
    const { data, error } = await page(from, from + FETCH_ALL_PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < FETCH_ALL_PAGE_SIZE) return all;
  }
}
