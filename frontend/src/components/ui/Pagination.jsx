import IconButton from './IconButton';
import './Pagination.css';

function pageWindow(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pages - 1, page + 1);
  if (start > 2) out.push('…');
  for (let i = start; i <= end; i += 1) out.push(i);
  if (end < pages - 1) out.push('…');
  out.push(pages);
  return out;
}

/**
 * Server-side pagination control. `page`, `pages` and `total` come straight
 * from the API envelope `{items, page, per_page, total, pages}`.
 */
export default function Pagination({
  page = 1,
  pages = 1,
  total = 0,
  perPage = 20,
  onPageChange,
  label = 'items',
  className = '',
}) {
  const safePages = Math.max(1, Number(pages) || 1);
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);

  return (
    <nav
      className={`sp-pagination ${className}`.trim()}
      aria-label="Pagination"
    >
      <p className="sp-pagination__summary">
        {total === 0
          ? `No ${label}`
          : `Showing ${from}–${to} of ${total.toLocaleString()} ${label}`}
      </p>

      <div className="sp-pagination__controls">
        <IconButton
          icon="chevronLeft"
          label="Previous page"
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange?.(page - 1)}
        />
        <ul className="sp-pagination__pages">
          {pageWindow(page, safePages).map((item, index) =>
            item === '…' ? (
              <li key={`gap-${index}`} className="sp-pagination__gap" aria-hidden="true">
                …
              </li>
            ) : (
              <li key={item}>
                <button
                  type="button"
                  className={`sp-pagination__page ${item === page ? 'is-active' : ''}`}
                  aria-current={item === page ? 'page' : undefined}
                  aria-label={`Page ${item}`}
                  onClick={() => onPageChange?.(item)}
                >
                  {item}
                </button>
              </li>
            ),
          )}
        </ul>
        <IconButton
          icon="chevronRight"
          label="Next page"
          size="sm"
          variant="outline"
          disabled={page >= safePages}
          onClick={() => onPageChange?.(page + 1)}
        />
      </div>
    </nav>
  );
}
