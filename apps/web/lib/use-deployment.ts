"use client";

import { useQuery } from "@tanstack/react-query";
import { type Deployment, getDeployment } from "./api";

/// Fetches the running deployment's contract addresses from the API once and caches them for the
/// session (they do not change within a run). Returns undefined while loading and null when the API
/// has no manifest, so callers can gate on-chain reads on a resolved address set.
export function useDeployment(): Deployment | null | undefined {
  const { data } = useQuery({
    queryKey: ["deployment"],
    queryFn: ({ signal }) => getDeployment(signal),
    staleTime: Infinity,
    retry: false,
  });
  return data;
}
