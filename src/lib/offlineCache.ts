export interface CachedPayload<T> {
  data: T;
  timestamp: number;
}

const OFFLINE_SESSION_KEY = "offline_session";
const OFFLINE_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface OfflineSession {
  username: string;
  role: string;
  full_name: string;
  market_section: string | null;
  passwordHash: string;
}

export type OfflineSessionLoadResult =
  | { status: "found"; session: CachedPayload<OfflineSession> }
  | { status: "missing" }
  | { status: "expired" }
  | { status: "invalid" };

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

const hashPassword = async (password: string): Promise<string> => {
  const encoded = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const saveOfflineSession = async (
  session: Omit<OfflineSession, "passwordHash"> & { password: string }
): Promise<void> => {
  const passwordHash = await hashPassword(session.password);
  saveOfflineCache<OfflineSession>(OFFLINE_SESSION_KEY, {
    username: session.username,
    role: session.role,
    full_name: session.full_name,
    market_section: session.market_section,
    passwordHash,
  });
};

export const loadOfflineSession = (): OfflineSessionLoadResult => {
  const cached = loadOfflineCache<OfflineSession>(OFFLINE_SESSION_KEY);
  if (!cached) return { status: "missing" };

  const isExpired = Date.now() - cached.timestamp > OFFLINE_SESSION_MAX_AGE_MS;
  if (isExpired) {
    localStorage.removeItem(OFFLINE_SESSION_KEY);
    return { status: "expired" };
  }

  const { data } = cached;
  if (
    !data.username ||
    !data.role ||
    !data.full_name ||
    !data.passwordHash
  ) {
    localStorage.removeItem(OFFLINE_SESSION_KEY);
    return { status: "invalid" };
  }

  return { status: "found", session: cached };
};

export const verifyOfflinePassword = async (
  password: string,
  passwordHash: string
): Promise<boolean> => {
  const enteredHash = await hashPassword(password);
  return enteredHash === passwordHash;
};
