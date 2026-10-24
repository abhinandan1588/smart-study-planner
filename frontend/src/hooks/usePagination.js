import { useCallback, useMemo, useState } from 'react';
import { PAGE_SIZE } from '../utils/constants';

/**
 * Server-side list state: page, per_page, search term and sort key, plus the
 * meta the API returns. `params` is ready to spread into a service call.
 */
export default function usePagination({
  initialPage = 1,
  perPage = PAGE_SIZE,
  initialSort = '',
  initialSearch = '',
} = {}) {
  const [page, setPage] = useState(initialPage);
  const [search, setSearchValue] = useState(initialSearch);
  const [sort, setSortValue] = useState(initialSort);
  const [meta, setMeta] = useState({ page: initialPage, pages: 1, total: 0, per_page: perPage });

  const setSearch = useCallback((value) => {
    setSearchValue(value);
    setPage(1);
  }, []);

  const setSort = useCallback((value) => {
    setSortValue(value);
    setPage(1);
  }, []);

  /** Toggle a column between ascending and descending (`-field`). */
  const toggleSort = useCallback((field) => {
    setSortValue((current) => (current === field ? `-${field}` : field));
    setPage(1);
  }, []);

  const applyMeta = useCallback((envelope) => {
    if (!envelope) return;
    setMeta({
      page: envelope.page ?? 1,
      pages: envelope.pages ?? 1,
      total: envelope.total ?? 0,
      per_page: envelope.per_page ?? perPage,
    });
  }, [perPage]);

  const params = useMemo(
    () => ({ page, per_page: perPage, q: search || '', sort: sort || '' }),
    [page, perPage, search, sort],
  );

  const reset = useCallback(() => {
    setPage(initialPage);
    setSearchValue(initialSearch);
    setSortValue(initialSort);
  }, [initialPage, initialSearch, initialSort]);

  return {
    page,
    setPage,
    perPage,
    search,
    setSearch,
    sort,
    setSort,
    toggleSort,
    meta,
    applyMeta,
    params,
    reset,
  };
}
