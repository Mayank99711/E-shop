export function PurchaseOrderList({ orders, onView }) {
  if (!orders.length) return <div className="empty-state">No purchase orders yet.</div>;
  return <div className="table-responsive"><table className="table align-middle workspace-table"><thead><tr><th>ID</th><th>Wholesaler</th><th>Status</th><th>Total</th><th>Actions</th></tr></thead><tbody>
    {orders.map((po) => (
      <tr key={po.id}>
        <td>{po.id.slice(0, 8)}</td>
        <td>{po.wholesaler?.name || po.wholesalerId}</td>
        <td>{po.status}</td>
        <td>{po.totalAmount}</td>
        <td><button className="btn btn-sm btn-outline-secondary" onClick={() => onView(po)}>View</button></td>
      </tr>
    ))}
  </tbody></table></div>;
}
