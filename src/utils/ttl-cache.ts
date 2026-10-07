// Round 48 Part C -- tiny per-process TTL cache for hot, read-mostly dropdown/list endpoints.
// Entries are keyed per tenant + query; any non-GET request to the company API clears the
// whole cache (see server wiring in company.routes.ts), so an edit is never hidden for longer
// than the request that made it.
type Entry = { at: number; value: unknown };
const store = new Map<string, Entry>();
export const TTL_MS = 20_000;

export async function cached<T>(key: string, load: () => Promise<T>, ttl = TTL_MS): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as T;
  const value = await load();
  store.set(key, { at: Date.now(), value });
  if (store.size > 500) store.delete(store.keys().next().value as string);
  return value;
}
export const clearCache = () => store.clear();
