import { useEffect, useState } from 'react';
import Checkbox from './Checkbox';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';
import Icon from './Icon';
import Input from './Input';
import Pagination from './Pagination';
import { SkeletonRows } from './Skeleton';
import './DataTable.css';

/**
 * Searchable, sortable, server-paginated table.
 *
 * columns: [{ key, header, render(row), width, sortable, align, hideOnMobile }]
 * Sorting and pagination are server driven: `onSort(field)` and
 * `onPageChange(page)` refetch, they never reorder the local array.
 * Below 640px each row collapses into a stacked card.
 */
export default function DataTable({
  columns = [],
  rows = [],
  rowKey = (row) => row.id,
  loading = false,
  error = null,
  onRetry,

  searchable = false,
  searchValue = '',
  onSearch,
  searchPlaceholder = 'Search…',

  sort = '',
  onSort,

  page = 1,
  pages = 1,
  total = 0,
  perPage = 20,
  onPageChange,
  paginated = true,
  itemLabel = 'rows',

  selectable = false,
  selectedIds = [],
  onSelectionChange,
  bulkActions,

  emptyTitle = 'No results',
  emptyDescription,
  emptyAction,
  emptyIcon = 'inbox',

  onRowClick,
  toolbar,
  caption,
  className = '',
}) {
  const [searchDraft, setSearchDraft] = useState(searchValue);

  useEffect(() => {
    setSearchDraft(searchValue);
  }, [searchValue]);

  // Debounced search: 300ms after the last keystroke the parent refetches.
  useEffect(() => {
    if (!searchable || !onSearch) return undefined;
    if (searchDraft === searchValue) return undefined;
    const timer = setTimeout(() => onSearch(searchDraft), 300);
    return () => clearTimeout(timer);
  }, [searchDraft, searchValue, searchable, onSearch]);

  const sortField = sort?.startsWith('-') ? sort.slice(1) : sort;
  const sortDirection = sort?.startsWith('-') ? 'desc' : 'asc';

  const allSelected =
    selectable && rows.length > 0 && rows.every((row) => selectedIds.includes(rowKey(row)));

  function toggleAll() {
    if (!onSelectionChange) return;
    onSelectionChange(allSelected ? [] : rows.map((row) => rowKey(row)));
  }

  function toggleOne(id) {
    if (!onSelectionChange) return;
    onSelectionChange(
      selectedIds.includes(id)
        ? selectedIds.filter((item) => item !== id)
        : [...selectedIds, id],
    );
  }

  const showToolbar = searchable || toolbar;
  const columnCount = columns.length + (selectable ? 1 : 0);

  return (
    <div className={`sp-table-wrap ${className}`.trim()}>
      {showToolbar ? (
        <div className="sp-table__toolbar">
          {searchable ? (
            <div className="sp-table__search">
              <Input
                type="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder={searchPlaceholder}
                iconLeft="search"
                size="sm"
                aria-label={searchPlaceholder}
              />
            </div>
          ) : null}
          {toolbar ? <div className="sp-table__toolbar-actions">{toolbar}</div> : null}
        </div>
      ) : null}

      {selectable && selectedIds.length > 0 ? (
        <div className="sp-table__bulkbar" role="region" aria-label="Bulk actions">
          <span className="sp-table__bulkcount">
            {selectedIds.length} selected
          </span>
          <div className="sp-table__bulkactions">{bulkActions}</div>
        </div>
      ) : null}

      {error ? (
        <ErrorState error={error} onRetry={onRetry} compact />
      ) : (
        <>
          <div className="sp-table__scroll">
            <table className="sp-table">
              {caption ? <caption className="sp-visually-hidden">{caption}</caption> : null}
              <thead>
                <tr>
                  {selectable ? (
                    <th className="sp-table__checkcell" scope="col">
                      <Checkbox
                        label=""
                        aria-label="Select all rows on this page"
                        checked={allSelected}
                        onChange={toggleAll}
                      />
                    </th>
                  ) : null}
                  {columns.map((column) => {
                    const isSorted = column.sortable && sortField === column.key;
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        style={column.width ? { width: column.width } : undefined}
                        className={[
                          column.align ? `is-${column.align}` : '',
                          column.hideOnMobile ? 'sp-table__cell--hide-sm' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        aria-sort={
                          isSorted
                            ? sortDirection === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : column.sortable
                              ? 'none'
                              : undefined
                        }
                      >
                        {column.sortable && onSort ? (
                          <button
                            type="button"
                            className={`sp-table__sortbtn ${isSorted ? 'is-sorted' : ''}`}
                            onClick={() => onSort(column.key)}
                          >
                            {column.header}
                            <Icon
                              name={
                                isSorted && sortDirection === 'desc'
                                  ? 'chevronDown'
                                  : 'chevronDown'
                              }
                              size={14}
                              className={
                                isSorted && sortDirection === 'asc'
                                  ? 'sp-table__sorticon is-asc'
                                  : 'sp-table__sorticon'
                              }
                            />
                          </button>
                        ) : (
                          column.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonRows rows={5} columns={columnCount} />
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={columnCount} className="sp-table__emptycell">
                      <EmptyState
                        icon={emptyIcon}
                        title={emptyTitle}
                        description={emptyDescription}
                        action={emptyAction}
                        compact
                      />
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const id = rowKey(row);
                    const selected = selectable && selectedIds.includes(id);
                    return (
                      <tr
                        key={id}
                        className={[
                          selected ? 'is-selected' : '',
                          onRowClick ? 'is-clickable' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                      >
                        {selectable ? (
                          <td
                            className="sp-table__checkcell"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Checkbox
                              label=""
                              aria-label={`Select row ${id}`}
                              checked={selected}
                              onChange={() => toggleOne(id)}
                            />
                          </td>
                        ) : null}
                        {columns.map((column) => (
                          <td
                            key={column.key}
                            data-label={
                              typeof column.header === 'string' ? column.header : undefined
                            }
                            className={[
                              column.align ? `is-${column.align}` : '',
                              column.hideOnMobile ? 'sp-table__cell--hide-sm' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            {column.render ? column.render(row) : row[column.key] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {paginated && !loading && rows.length > 0 ? (
            <div className="sp-table__footer">
              <Pagination
                page={page}
                pages={pages}
                total={total}
                perPage={perPage}
                onPageChange={onPageChange}
                label={itemLabel}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
