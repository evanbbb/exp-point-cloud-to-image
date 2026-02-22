export function makeSessionKey(sessionId: string, sessionBucket: string | null): string {
  return `${sessionBucket ?? ""}::${sessionId}`;
}

export function pruneBoundedSessionStore<T>(options: {
  store: Map<string, Map<string, T>>;
  maxPerSession: number;
  shouldExpire: (entry: T, nowMs: number) => boolean;
  sortValue: (entry: T) => number;
}): void {
  const { store, maxPerSession, shouldExpire, sortValue } = options;
  const nowMs = Date.now();

  for (const [sessionKey, sessionEntries] of store.entries()) {
    for (const [entryKey, entry] of sessionEntries.entries()) {
      if (shouldExpire(entry, nowMs)) {
        sessionEntries.delete(entryKey);
      }
    }

    if (sessionEntries.size > maxPerSession) {
      const sortedByOldest = [...sessionEntries.entries()].sort((a, b) => sortValue(a[1]) - sortValue(b[1]));
      const overflow = sessionEntries.size - maxPerSession;
      for (let i = 0; i < overflow; i += 1) {
        const entryKey = sortedByOldest[i]?.[0];
        if (entryKey) {
          sessionEntries.delete(entryKey);
        }
      }
    }

    if (sessionEntries.size === 0) {
      store.delete(sessionKey);
    }
  }
}
