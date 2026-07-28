import { useEffect, useState, useRef } from "react";

// Simple in-memory cache shared across all useApi() calls for the lifetime
// of the page. Keeps repeat visits to the same route instant, and lets
// multiple components request the same path without duplicate fetches.
const cache = new Map(); // path -> { data, timestamp }
const inFlight = new Map(); // path -> Promise

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes — data here doesn't change often

function fetchJson(path) {
  if (inFlight.has(path)) return inFlight.get(path);

  const promise = fetch(`/api/${path}`)
    .then((r) => {
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      return r.json();
    })
    .then((json) => {
      cache.set(path, { data: json, timestamp: Date.now() });
      inFlight.delete(path);
      return json;
    })
    .catch((e) => {
      inFlight.delete(path);
      throw e;
    });

  inFlight.set(path, promise);
  return promise;
}

export function useApi(path, { ttl = DEFAULT_TTL_MS, skipCache = false } = {}) {
  const cached = !skipCache && cache.has(path) ? cache.get(path) : null;
  const isFresh = cached && Date.now() - cached.timestamp < ttl;

  const [data, setData] = useState(isFresh ? cached.data : null);
  const [error, setError] = useState(null);
  // If we already have fresh cached data, skip the loading spinner entirely.
  const [loading, setLoading] = useState(!isFresh);
  const pathRef = useRef(path);

  useEffect(() => {
    let cancelled = false;
    pathRef.current = path;

    const existing = !skipCache && cache.has(path) ? cache.get(path) : null;
    const fresh = existing && Date.now() - existing.timestamp < ttl;

    if (fresh) {
      // Serve cached data immediately, no network round trip.
      setData(existing.data);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    fetchJson(path)
      .then((json) => { if (!cancelled) setData(json); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [path, ttl, skipCache]);

  return { data, error, loading };
}

// Call this after any action that should invalidate cached reads
// (not currently used since this app is read-only, but here for later).
export function clearApiCache(path) {
  if (path) cache.delete(path);
  else cache.clear();
}