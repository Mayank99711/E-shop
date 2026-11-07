

export function AdminPagination({ page, pageCount, onChange }) {
  if (pageCount <= 1) return null;
  return <nav className="list-pagination" aria-label="Category pages"><button className="btn btn-sm btn-outline-secondary" type="button" disabled={page === 1} onClick={() => onChange(page - 1)}>Previous</button><span>Page {page} of {pageCount}</span><button className="btn btn-sm btn-outline-secondary" type="button" disabled={page === pageCount} onClick={() => onChange(page + 1)}>Next</button></nav>;
}


export function Notice({ error, notice }) {
  if (!error && !notice) return null;
  return <div className={`workspace-notice ${error ? "error" : "success"}`} role={error ? "alert" : "status"}>{error || notice}</div>;
}


export function FieldError({ errors, field }) {
  const message = errors?.[field];
  return message ? <small className="field-error" role="alert">{message}</small> : null;
}
