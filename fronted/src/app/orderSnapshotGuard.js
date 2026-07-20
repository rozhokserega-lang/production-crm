/**
 * A transient/partial background response must not wipe an already rendered
 * order list. Explicit foreground loads may still apply an empty snapshot.
 */
export function reconcileOrderSnapshot(currentRows, incomingRows, { preserveOnEmpty = false } = {}) {
  const current = Array.isArray(currentRows) ? currentRows : [];
  const incoming = Array.isArray(incomingRows) ? incomingRows : [];
  if (preserveOnEmpty && current.length > 0 && incoming.length === 0) {
    return current;
  }
  return incoming;
}
