import "server-only";

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

const CHUNK = 1000;

/**
 * Reads every row of a query. Supabase caps a response at 1000 rows, so this
 * asks for consecutive ranges until a short page comes back. The query passed
 * in must have a stable order (for example by id) for the pages to line up.
 */
export async function readAll<T>(fetchPage: (start: number, end: number) => Page<T>, what: string): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += CHUNK) {
    const { data, error } = await fetchPage(start, start + CHUNK - 1);
    if (error) throw new Error(`Could not load ${what}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < CHUNK) return rows;
  }
}
