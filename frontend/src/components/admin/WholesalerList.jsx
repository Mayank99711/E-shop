export function WholesalerList({ items, loading, busy, statusChangingId = "", onToggle }) {
  if (loading) return <div className="empty-state">Loading...</div>;
  if (!items.length) return <div className="empty-state">No wholesalers yet.</div>;
  return <div className="table-responsive"><table className="table align-middle workspace-table"><thead><tr><th>Code</th><th>Name</th><th>Status</th></tr></thead><tbody>
    {items.map((item) => (
      <tr key={item.id}>
        <td>{item.code}</td>
        <td>{item.name}</td>
        <td><button type="button" className={`status-pill ${item.status === "ACTIVE" ? "active" : "inactive"} status-toggle`} disabled={busy || statusChangingId === item.id} aria-label={`${statusChangingId === item.id ? "Saving" : item.status === "ACTIVE" ? "Deactivate" : "Activate"} ${item.name}`} onClick={() => onToggle(item)}>{statusChangingId === item.id ? "Saving..." : item.status}</button></td>
      </tr>
    ))}
  </tbody></table></div>;
}
