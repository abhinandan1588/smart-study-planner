import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeError } from '../services/api';

/**
 * Loading / data / error state for a GET-style call.
 *
 * `fetcher` must be stable (wrap it in useCallback). Set `immediate: false`
 * to call `reload()` yourself.
 */
export default function useApi(fetcher, { immediate = true, onSuccess } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const mountedRef = useRef(true);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetcher(...args);
        if (mountedRef.current) {
          setData(result);
          onSuccessRef.current?.(result);
        }
        return result;
      } catch (caught) {
        const normalized = normalizeError(caught);
        if (mountedRef.current) setError(normalized);
        throw normalized;
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [fetcher],
  );

  useEffect(() => {
    if (!immediate) return;
    run().catch(() => {
      /* error is already in state and rendered by ErrorState */
    });
  }, [immediate, run]);

  return { data, error, loading, reload: run, setData };
}

/**
 * Mutation state for POST/PATCH/DELETE. Returns `mutate` which rethrows the
 * normalised ApiError so callers can show field errors or a toast.
 */
export function useMutation(mutator) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const mutate = useCallback(
    async (...args) => {
      setLoading(true);
      setError(null);
      try {
        return await mutator(...args);
      } catch (caught) {
        const normalized = normalizeError(caught);
        setError(normalized);
        throw normalized;
      } finally {
        setLoading(false);
      }
    },
    [mutator],
  );

  return { mutate, loading, error, setError };
}
