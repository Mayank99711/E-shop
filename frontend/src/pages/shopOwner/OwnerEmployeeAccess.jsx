
import { useEffect, useState } from "react";
import { apiRequest } from "../../services/apiClient.js";
import "../../features/employee/delivery/DeliveryProfessional.css";

const GROUPS = [
  ["Dashboard", [
    ["dashboard.view", "View Dashboard"],
  ]],
  ["Orders", [
    ["orders.view", "View Orders"],
    ["orders.manage", "Manage Orders"],
    ["orders.update", "Update Status"],
    ["orders.edit", "Edit Order"],
    ["orders.cancel", "Cancel Order"],
  ]],
  ["Products", [
    ["products.view", "View Products"],
    ["products.manage", "Manage Products"],
    ["products.create", "Add Product"],
    ["products.edit", "Edit Product"],
    ["products.delete", "Delete Product"],
  ]],
  ["Inventory", [
    ["inventory.view", "View Inventory"],
    ["inventory.manage", "Manage Inventory"],
    ["inventory.update", "Update Stock"],
  ]],
  ["Customers", [
    ["customers.view", "View Customers"],
    ["customers.manage", "Manage Customers"],
    ["customers.edit", "Edit Customer"],
  ]],
  ["Deliveries", [
    ["delivery.view", "View Deliveries"],
    ["delivery.manage", "Manage Deliveries"],
    ["delivery.assign", "Assign Delivery"],
    ["delivery.pickup", "Confirm Pickup"],
    ["delivery.update", "Update Delivery Status"],
    ["delivery.complete", "Complete Delivery"],
  ]],
  ["Returns", [
    ["returns.view", "View Returns"],
    ["returns.assign", "Assign Return Pickup"],
    ["returns.approve", "Approve Return"],
    ["returns.reject", "Reject Return"],
    ["returns.collect", "Collect Return"],
    ["returns.handover", "Handover Return"],
  ]],
  ["Payments", [
    ["payments.view", "View Payments"],
    ["payments.verify_cod", "Verify COD"],
  ]],
  ["Reports", [
    ["reports.view", "View Reports"],
  ]],
  ["Employees", [
    ["employees.view", "View Employees"],
    ["employees.manage", "Manage Employees"],
    ["employees.create", "Add Employee"],
    ["employees.edit", "Edit Employee"],
    ["employees.assign", "Assign Role"],
    ["employees.permissions", "Manage Access"],
    ["employees.delete", "Delete Employee"],
  ]],
];

export default function OwnerEmployeeAccess() {
  const [employees, setEmployees] = useState([]);
  const [chosen, setChosen] = useState("");
  const [permissions, setPermissions] = useState([]);
  const [defaults, setDefaults] = useState([]);
  const [custom, setCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let live = true;

    apiRequest("/api/owner/employees")
      .then((response) => {
        if (!live) return;

        const list = response.items || [];

        setEmployees(list);
        setChosen(list[0]?.id || "");
        setLoading(false);
      })
      .catch((requestError) => {
        if (!live) return;

        setError(requestError.message);
        setLoading(false);
      });

    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!chosen) return;

    let live = true;

    setLoading(true);
    setError("");
    setMessage("");

    apiRequest(`/api/owner/employees/${chosen}/permissions`)
      .then((response) => {
        if (!live) return;

        setPermissions(response.data.permissions || []);
        setDefaults(response.data.roleDefaults || []);
        setCustom(Boolean(response.data.usesCustomPermissions));
      })
      .catch((requestError) => {
        if (live) {
          setError(requestError.message);
        }
      })
      .finally(() => {
        if (live) {
          setLoading(false);
        }
      });

    return () => {
      live = false;
    };
  }, [chosen]);

  const employee = employees.find((item) => item.id === chosen);

  function toggle(right) {
    setCustom(true);
    setMessage("");

    setPermissions((current) =>
      current.includes(right)
        ? current.filter((permission) => permission !== right)
        : [...current, right]
    );
  }

  function restoreDefaults() {
    setPermissions([...defaults]);
    setCustom(false);
    setMessage("");
  }

  async function save() {
    if (!chosen || saving || loading) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await apiRequest(
        `/api/owner/employees/${chosen}/permissions`,
        {
          method: "PATCH",
          body: { permissions },
        }
      );

      setMessage("Employee access updated successfully.");
      setCustom(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="dp-owner-shell">
      <div className="dp-heading">
        <div>
          <p className="dp-eyebrow">
            EMPLOYEES / ACCESS MANAGEMENT
          </p>

          <h2>Employee Access Control</h2>

          <p>
            Review and manage permissions for your shop employees.
          </p>
        </div>
      </div>

      {error && (
        <p className="dp-alert" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="dp-success" role="status">
          {message}
        </p>
      )}

      <div className="dp-panel">
        <label
          className="dp-label"
          htmlFor="chooseEmployee"
        >
          Select Employee
        </label>

        <select
          id="chooseEmployee"
          className="form-select"
          value={chosen}
          disabled={saving}
          onChange={(event) => setChosen(event.target.value)}
        >
          <option value="">Select employee</option>

          {employees.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} — {item.employeeRole || "No role"}
              {item.isActive ? "" : " (Inactive)"}
            </option>
          ))}
        </select>

        {employee && (
          <div className="dp-access-employee">
            <strong>{employee.name}</strong>

            <span>
              {employee.employeeCode} ·
              {" "}
              {employee.employeeRole || "Role not assigned"}
            </span>

            <span className="dp-tag">
              {employee.isActive ? "Active" : "Inactive"}
            </span>
          </div>
        )}

        {loading ? (
          <p>Loading permissions...</p>
        ) : employee ? (
          <>
            <p className="dp-muted">
              {custom ? "Custom access" : "Role default access"}
              {" · "}
              {permissions.length} permissions selected
            </p>

            <div className="dp-permission-grid">
              {GROUPS.map(([group, rights]) => (
                <div
                  className="dp-permission-group"
                  key={group}
                >
                  <h3>{group}</h3>

                  {rights.map(([right, label]) => (
                    <label
                      key={right}
                      className="dp-permission-row"
                    >
                      <input
                        type="checkbox"
                        checked={permissions.includes(right)}
                        onChange={() => toggle(right)}
                        disabled={saving}
                      />

                      <span>{label}</span>

                      <small>{right}</small>
                    </label>
                  ))}
                </div>
              ))}
            </div>

            <div className="dp-actions">
              <button
                className="btn btn-outline-secondary"
                type="button"
                onClick={restoreDefaults}
                disabled={saving}
              >
                Restore role defaults
              </button>

              <button
                className="btn btn-primary"
                type="button"
                onClick={save}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save permissions"}
              </button>
            </div>
          </>
        ) : (
          <p>No employee selected.</p>
        )}
      </div>
    </section>
  );
}
