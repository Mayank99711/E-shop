

export function ListPagination({ page, pageCount, onChange }) {
  if (pageCount <= 1) return null;
  return (
    <nav className="list-pagination" aria-label="List pages">
      <button className="btn btn-sm btn-outline-secondary" type="button" disabled={page === 1} onClick={() => onChange(page - 1)}>Previous</button>
      <span>Page {page} of {pageCount}</span>
      <button className="btn btn-sm btn-outline-secondary" type="button" disabled={page === pageCount} onClick={() => onChange(page + 1)}>Next</button>
    </nav>
  );
}
