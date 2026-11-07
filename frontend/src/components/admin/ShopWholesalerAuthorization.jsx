export function ShopWholesalerAuthorization({ items, assignments, busy, onAssign, onRevoke }) {
  return <div className="table-responsive"><table className="table align-middle workspace-table"><thead><tr><th>Wholesaler</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    {items.filter((w) => w.status === "ACTIVE").map((w) => {
      const assigned = assignments.some((a) => a.wholesaler?.id === w.id && a.isActive);
      return (
        <tr key={w.id}>
          <td>{w.name} ({w.code})</td>
          <td>{assigned ? "Authorized" : "Not authorized"}</td>
          <td>
            {assigned ? <button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => onRevoke(w.id)}>Revoke</button> :
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => onAssign(w.id)}>Assign</button>}
          </td>
        </tr>
      );
    })}
  </tbody></table></div>;
}
