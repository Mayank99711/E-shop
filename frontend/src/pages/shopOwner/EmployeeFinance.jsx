import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../services/apiClient.js";

export default function EmployeeFinance({ mode }) {
  const isReports = mode === "reports";
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const result = await apiRequest(`/api/employee/${isReports ? "reports" : "payments"}`, { portal: "shop-owner" });
      setState({ loading: false, data: result, error: "" });
    } catch (error) { setState({ loading: false, data: null, error: error.message || "Unable to load." }); }
  }, [isReports]);
  useEffect(() => { load(); }, [load]);
  return <section className="employee-panel">
    <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-3">
      <div><h2>{isReports ? "Shop reports" : "Shop payments"}</h2><p>Read-only data for your assigned shop.</p></div>
      <button className="employee-secondary-btn" type="button" onClick={load} disabled={state.loading}>Refresh</button>
    </div>
    {state.loading ? <p role="status">Loading...</p> : state.error ? <p role="alert">{state.error}</p> : isReports ? <>
      <div className="employee-stats">
        {[ ["Orders", state.data?.data?.orders], ["Products", state.data?.data?.products], ["Active products", state.data?.data?.activeProducts], ["Stock units", state.data?.data?.stockUnits] ].map(([label, count]) =>
          <div className="employee-stat" key={label}><span>{label}</span><strong>{count ?? 0}</strong></div>
        )}
      </div>
      <h3>Order status breakdown</h3>
      <ul>{(state.data?.data?.orderStatuses || []).map((item) => <li key={item.status}>{item.status.replaceAll("_", " ")}: {item.count}</li>)}</ul>
    </> : <>
      <p>{state.data?.note}</p>
      <div className="employee-catalog-table-wrap"><table className="employee-catalog-table"><thead><tr><th>Order</th><th>Provider</th><th>Status</th><th>Date</th></tr></thead><tbody>
        {(state.data?.items || []).map((p) => <tr key={p.id}><td>{p.orderNumber}</td><td>{p.provider}</td><td>{p.status}</td><td>{new Date(p.createdAt).toLocaleDateString()}</td></tr>)}
      </tbody></table></div>
      {!(state.data?.items || []).length && <p>No recent payments found.</p>}
    </>}
  </section>;
}
