// Minimal client for the Meridian backend API (backend/api). Reads are public; the base URL is
// configurable so the same build can point at a local node or a hosted gateway. Defaults to the
// local dev API so `dev-up` works with no extra config.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// The API renders bigints as decimal strings (see backend/api serialize.ts).
export interface PoolView {
  totalDeposited: string;
  totalBorrowed: string;
  cumulativeInterestRepaid: string;
  utilizationWad: string;
  lastBlock: string;
}

export interface AccountView {
  account: string;
  owner: string;
  facePrincipal: string;
  collateralDeposited: string;
  open: boolean;
  liquidated: boolean;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export function getPool(signal?: AbortSignal): Promise<PoolView> {
  return getJson<PoolView>("/pools", signal);
}

export function getAccounts(signal?: AbortSignal): Promise<AccountView[]> {
  return getJson<AccountView[]>("/accounts", signal);
}
