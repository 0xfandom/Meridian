"use client";

import { useEffect, useState } from "react";
import { type AccountView, getAccounts } from "./api";

/// Polls the live credit-account book from the backend API. Returns null until the first successful
/// fetch and stays null when the API is unreachable, so callers can fall back to placeholder data
/// offline (CI build, no local node).
export function useAccounts(pollMs = 8000): AccountView[] | null {
  const [accounts, setAccounts] = useState<AccountView[] | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const load = async () => {
      try {
        const next = await getAccounts(controller.signal);
        if (active) setAccounts(next);
      } catch {
        // Unreachable API: leave null so the caller keeps its placeholder data.
      }
    };

    void load();
    const id = setInterval(() => void load(), pollMs);
    return () => {
      active = false;
      controller.abort();
      clearInterval(id);
    };
  }, [pollMs]);

  return accounts;
}
