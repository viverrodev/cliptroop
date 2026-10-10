/**
 * One more try for a database call that failed for a passing reason (a
 * dropped connection, a busy pool, the API waking up, its schema reloading
 * after a migration). "No rows" (PGRST116) is an answer, not a failure, and
 * is never retried. Use it for the reads a page can't do without (the
 * person's teams, their membership): a hiccup there must never look like
 * "you have no team".
 */
export async function retryOnce<T extends { error: { code?: string | null } | null }>(run: () => PromiseLike<T>, waitMs = 120): Promise<T> {
  const first = await run();
  if (!first.error || first.error.code === "PGRST116") return first;
  await new Promise((r) => setTimeout(r, waitMs));
  return run();
}
