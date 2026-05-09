export interface CachedPayload<T> {
  data: T;
  timestamp: number;
}

export const saveOfflineCache = <T>(key: string, data: T) => {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    key,
    JSON.stringify({
      data,
      timestamp: Date.now(),
    } satisfies CachedPayload<T>)
  );
};

export const loadOfflineCache = <T>(key: string): CachedPayload<T> | null => {
  if (typeof localStorage === "undefined") return null;

  const raw = localStorage.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as CachedPayload<T>;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
};
