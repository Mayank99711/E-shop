import { useEffect, useMemo, useState } from "react";
import { shopOwnerApi } from "../../services/shopOwner/index.js";
import Modal from "../../components/common/Modal.jsx";
import { ListPagination } from "../../components/shopOwner/ListPagination.jsx";
import "./EmployeeManagement.css";

const ROLES = [
  ["SHOP_MANAGER", "Shop Manager"],
  ["SALES_STAFF", "Sales Staff"],
  ["INVENTORY_STAFF", "Inventory Staff"],
  ["DELIVERY_ASSOCIATE", "Delivery Associate"],
];
const PRESETS = {
  SHOP_MANAGER: ["dashboard.view", "orders.view", "orders.manage", "products.view", "products.manage", "inventory.view", "inventory.manage", "customers.view", "customers.manage", "delivery.view", "delivery.manage", "reports.view"],
  SALES_STAFF: ["dashboard.view", "orders.view", "orders.manage", "products.view", "customers.view"],
  INVENTORY_STAFF: ["dashboard.view", "products.view", "inventory.view", "inventory.manage"],
  DELIVERY_ASSOCIATE: ["dashboard.view", "delivery.view", "delivery.manage"],
};
const PERMISSION_GROUPS = [
  ["Dashboard", [["dashboard.view", "View Dashboard"]]],
  ["Orders", [
    ["orders.view", "View Orders"], ["orders.manage", "Manage Orders"],
    ["orders.update", "Update Status"], ["orders.edit", "Edit Order"],
    ["orders.cancel", "Cancel Order"],
  ]],
  ["Products", [
    ["products.view", "View Products"], ["products.manage", "Manage Products"],
    ["products.create", "Add Product"], ["products.edit", "Edit Product"],
    ["products.delete", "Delete Product"],
  ]],
  ["Inventory", [
    ["inventory.view", "View Inventory"], ["inventory.manage", "Manage Inventory"],
    ["inventory.update", "Update Stock"],
  ]],
  ["Customers", [
    ["customers.view", "View Customers"], ["customers.manage", "Manage Customers"],
    ["customers.edit", "Edit Customer"],
  ]],
  ["Deliveries", [
    ["delivery.view", "View Deliveries"], ["delivery.manage", "Manage Deliveries"],
    ["delivery.assign", "Assign Delivery"], ["delivery.pickup", "Confirm Pickup"],
    ["delivery.update", "Update Delivery Status"], ["delivery.complete", "Complete Delivery"],
  ]],
  ["Returns", [
    ["returns.view", "View Returns"], ["returns.assign", "Assign Return Pickup"],
    ["returns.approve", "Approve Return"], ["returns.reject", "Reject Return"],
    ["returns.collect", "Collect Return"], ["returns.handover", "Handover Return"],
  ]],
  ["Payments", [["payments.view", "View Payments"], ["payments.verify_cod", "Verify COD"]]],
  ["Reports", [["reports.view", "View Reports"]]],
  ["Employees", [
    ["employees.view", "View Employees"], ["employees.manage", "Manage Employees"],
    ["employees.create", "Add Employee"], ["employees.edit", "Edit Employee"],
    ["employees.assign", "Assign Role"], ["employees.permissions", "Manage Access"],
    ["employees.delete", "Delete Employee"],
  ]],
];
const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap(([, rights]) => rights.map(([key]) => key));
const LABELS = Object.fromEntries(ROLES);
const dateOnly = (value) => value ? String(value).slice(0, 10) : "";
const money = (value) => value == null ? "" : String(value);
function freshForm() {
  return { name: "", email: "", mobile: "", designation: "", joiningDate: new Date().toISOString().slice(0, 10), role: "SALES_STAFF", permissions: [...PRESETS.SALES_STAFF], salary: "", loginEnabled: false, isActive: true };
}
function fromEmployee(employee) {
  return {
    name: employee.name || "", email: employee.email || "", mobile: employee.mobile || "",
    designation: employee.designation || "", joiningDate: dateOnly(employee.joiningDate),
    role: employee.employeeRole || "", permissions: [],
    salary: money(employee.salaryHistory?.[0]?.amount),
    loginEnabled: Boolean(employee.userId), isActive: Boolean(employee.isActive),
  };
}
function Section({ number, title, children }) {
  return <section className="eum-section"><h3><span>{number}</span>{title}</h3>{children}</section>;
}

export default function EmployeeManagement({ employees = [], busy = false, reload = () => {}, loading = false }) {
  const [customRoles, setCustomRoles] = useState([]);
  const [roleInputOpen, setRoleInputOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [roleBusy, setRoleBusy] = useState(false);
  const roles = [...ROLES, ...customRoles.map(r => [r.code, r.name])];
  const roleDefaults = Object.fromEntries(customRoles.map(r => [r.code, r.defaultPermissions]));
  const roleNames = Object.fromEntries(roles);
  useEffect(() => { let live = true; shopOwnerApi.listEmployeeRoles().then(r => { if (live) setCustomRoles(r.items || []); }).catch(() => {}); return () => {live=false}; }, []);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [mode, setMode] = useState(null);
  const [form, setForm] = useState(freshForm);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [expandedPermissions, setExpandedPermissions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loginAccountCreated, setLoginAccountCreated] = useState(false);
  const [salarySavedFor, setSalarySavedFor] = useState(null);
  const [permissionsMode, setPermissionsMode] = useState("defaults");
  const [roleChanged, setRoleChanged] = useState(false);
  const [permissionReady, setPermissionReady] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState("");

  const filtered = useMemo(() => employees.filter((employee) =>
    (filter === "ALL" || String(employee.isActive) === filter) &&
    [employee.name, employee.employeeCode, employee.designation, employee.employeeRole, employee.email, employee.mobile]
      .some((value) => String(value || "").toLowerCase().includes(query.trim().toLowerCase()))
  ).sort((a, b) => a.name.localeCompare(b.name)), [employees, filter, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  const current = filtered.slice((page - 1) * 10, page * 10);
  const inactiveCount = employees.filter((employee) => !employee.isActive).length;
  const activeCount = employees.length - inactiveCount;
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const close = () => { if (!saving && !actionBusy && !permissionsLoading) { setMode(null); setEditing(null); setError(""); } };
  const openAdd = () => { setRoleInputOpen(false); setNewRoleName(""); setEditing(null); setForm(freshForm()); setPermissionsMode("defaults"); setRoleChanged(false); setPermissionReady(true); setLoginAccountCreated(false); setSalarySavedFor(null); setError(""); setNotice(""); setMode("edit"); };
  async function openEdit(employee) {
    setRoleInputOpen(false); setNewRoleName("");
    setEditing(employee);
    setForm(fromEmployee(employee));
    setLoginAccountCreated(Boolean(employee.userId));
    setSalarySavedFor(null);
    setPermissionReady(false);
    setPermissionsLoading(true);
    setError(""); setNotice(""); setRoleChanged(false); setMode("edit");
    try {
      const response = await shopOwnerApi.getEmployeePermissions(employee.id);
      const payload = response?.data;
      if (!Array.isArray(payload?.permissions)) throw new Error("Invalid permissions response from server.");
      setForm((prev) => ({ ...prev, permissions: [...payload.permissions] }));
      setPermissionsMode(payload.usesCustomPermissions ? "custom" : "defaults");
      setPermissionReady(true);
    } catch (err) { setError(err.message || "Cannot load employee permissions."); }
    finally { setPermissionsLoading(false); }
  }
  const selectRole = (role) => {
    if (form.role === role) return;
    setForm((prev) => ({ ...prev, role, permissions: [...(PRESETS[role] || roleDefaults[role] || [])] }));
    setRoleChanged(true); setPermissionsMode("defaults");
  };
  async function createInlineRole() {
    const name = newRoleName.trim();
    if (!name || roleBusy) return;
    if (roles.some(([, title]) => title.toLowerCase() === name.toLowerCase())) { setError("Role already exists. Select it from the dropdown."); return; }
    setRoleBusy(true); setError("");
    try {
      // No automatic privileges: owner may grant only rights the backend recognizes.
      const response = await shopOwnerApi.createEmployeeRole({ name, permissions: [] });
      const created = response.data;
      if (!created?.code) throw new Error("Server did not return a new role code.");
      setCustomRoles(old => [...old, created]);
      setForm(prev => ({ ...prev, role: created.code, permissions: [] }));
      setPermissionsMode("defaults"); setRoleChanged(true);
      setNewRoleName(""); setRoleInputOpen(false);
    } catch (err) { setError(err.message || "Cannot create role."); }
    finally { setRoleBusy(false); }
  }
  const toggle = (permission) => {
    setPermissionsMode("custom");
    setForm((prev) => ({ ...prev, permissions: prev.permissions.includes(permission) ? prev.permissions.filter((item) => item !== permission) : [...prev.permissions, permission] }));
  };
  const latestSalary = editing?.salaryHistory?.[0];
  const salaryChanged = editing && form.salary.trim() !== money(latestSalary?.amount);
  const roleChangedFromSaved = editing && form.role !== (editing.employeeRole || "");
  const permissionsChanged = permissionReady && (roleChangedFromSaved || permissionsMode === "custom");

  async function save(event) {
    event.preventDefault();
    if (saving || busy || !permissionReady || permissionsLoading) return;
    if (!form.role) { setError("Select an employee role."); return; }
    if (form.loginEnabled && !form.email.trim()) { setError("A valid employee email is required for login access."); return; }
    if (!form.salary.trim() || !Number.isFinite(Number(form.salary)) || Number(form.salary) <= 0) { setError("Salary must be greater than zero."); return; }
    setSaving(true); setError(""); setNotice("");
    let employee = editing;
    let stage = "Saving employee details";
    try {
      if (!employee) {
        const body = { name: form.name.trim(), mobile: form.mobile.trim(), designation: roleNames[form.role] || "Employee", joiningDate: form.joiningDate };
        if (form.email.trim()) body.email = form.email.trim();
        if (form.salary.trim()) body.initialSalary = form.salary.trim();
        const response = await shopOwnerApi.createEmployee(body);
        employee = response.employee;
        if (!employee?.id) throw new Error("Employee was created, but server returned no employee ID. Refresh before retrying.");
        setEditing(employee); // Prevent creating a duplicate on retry if a later step fails.
        if (form.salary.trim()) setSalarySavedFor(`${employee.id}:${form.salary.trim()}`);
      } else {
        const details = {};
        for (const key of ["name", "email", "mobile"]) {
          const nextValue = form[key].trim();
          if (nextValue !== String(employee[key] || "")) details[key] = key === "email" ? (nextValue || null) : nextValue;
        }
        if (form.role !== employee.employeeRole) details.designation = roleNames[form.role] || "Employee";
        if (form.joiningDate !== dateOnly(employee.joiningDate)) details.joiningDate = form.joiningDate;
        if (Object.keys(details).length) await shopOwnerApi.updateEmployeeDetails(employee.id, details);
        if (form.isActive !== Boolean(employee.isActive)) await shopOwnerApi.updateEmployee(employee.id, { isActive: form.isActive });
        if (salaryChanged && form.salary.trim() && salarySavedFor !== `${employee.id}:${form.salary.trim()}`) {
          stage = "Saving salary history";
          await shopOwnerApi.addEmployeeSalary(employee.id, { amount: form.salary.trim(), effectiveFrom: new Date().toISOString().slice(0, 10) });
          setSalarySavedFor(`${employee.id}:${form.salary.trim()}`);
        }
      }
      if (form.role && (!employee.employeeRole || employee.employeeRole !== form.role)) {
        stage = "Assigning employee role";
        await shopOwnerApi.assignEmployeeRole(employee.id, form.role);
      }
      if (permissionReady) {
        stage = "Saving employee permissions";
        await shopOwnerApi.updateEmployeePermissions(employee.id, form.permissions);
      }
      if (form.loginEnabled && !loginAccountCreated) {
        stage = "Creating employee login account";
        await shopOwnerApi.createEmployeeLoginAccount(employee.id);
        setLoginAccountCreated(true);
      }
      await reload();
      setMode(null); setEditing(null);
      setNotice("Employee information saved successfully.");
    } catch (err) {
      setError(`${stage} failed: ${err.message || "Please retry"}. Previous successful steps may already be saved. This form remains open to avoid duplicate creation.`);
      await Promise.resolve(reload()).catch(() => {});
    } finally { setSaving(false); }
  }

  async function sendActivation() {
    if (!editing?.id || !loginAccountCreated || actionBusy) return;
    setActionBusy(true); setError(""); setNotice("");
    try {
      await shopOwnerApi.sendEmployeeActivation(editing.id);
      setNotice("Activation email requested successfully. Check delivery with the employee.");
    } catch (err) { setError(err.message || "Could not send activation email."); }
    finally { setActionBusy(false); }
  }

  function requestStatusChange(employee) {
    if (busy || saving || statusBusy || loading) return;
    setStatusError("");
    setPendingStatusChange({
      id: employee.id,
      name: employee.name,
      currentIsActive: Boolean(employee.isActive),
      nextIsActive: !employee.isActive,
    });
  }

  function cancelStatusChange() {
    if (statusBusy) return;
    setPendingStatusChange(null);
    setStatusError("");
  }

  async function confirmStatusChange() {
    if (!pendingStatusChange || statusBusy || busy || saving) return;
    setStatusBusy(true);
    setStatusError("");
    const { id, nextIsActive } = pendingStatusChange;
    try {
      await shopOwnerApi.updateEmployee(id, { isActive: nextIsActive });
      await reload();
      setPendingStatusChange(null);
      setNotice(`Employee ${nextIsActive ? "activated" : "deactivated"} successfully.`);
    } catch (err) {
      setStatusError(err?.message || "Could not update employee status. Please retry.");
    } finally {
      setStatusBusy(false);
    }
  }

  return <div className="eum-root">
    <section className="workspace-card eum-page">
      <div className="eum-header"><div><h2>Employee Management</h2><p>Manage your team, roles, access and salary from one place.</p></div><button type="button" className="btn btn-primary" onClick={openAdd} disabled={busy}>+ Add Employee</button></div>
      <div className="eum-stats"><div><small>Total employees</small><strong>{employees.length}</strong></div><div><small>Active employees</small><strong>{activeCount}</strong></div><div><small>Inactive employees</small><strong>{inactiveCount}</strong></div></div>
      {notice && !mode && <p className="alert alert-success" role="status">{notice}</p>}
      <div className="eum-toolbar"><label>Search employees<input className="form-control" placeholder="Name, code, role or contact" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }}/></label><label>Status<select className="form-select" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}><option value="ALL">All employees</option><option value="true">Active</option><option value="false">Inactive</option></select></label><button className="btn btn-outline-secondary" type="button" onClick={reload} disabled={loading || busy}>Refresh</button></div>
      <div className="employee-table-wrap"><table className="employee-table eum-table"><thead><tr><th>Employee Name</th><th>Employee Code</th><th>Employee Role</th><th>Email</th><th>Phone</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {current.map((employee) => <tr key={employee.id}><td><strong>{employee.name}</strong></td><td>{employee.employeeCode}</td><td>{roleNames[employee.employeeRole] || employee.employeeRole || "No role"}</td><td>{employee.email || "—"}</td><td>{employee.mobile}</td><td><button type="button" className={`eum-status eum-status-toggle ${employee.isActive ? "eum-active" : "eum-inactive"}`} onClick={() => requestStatusChange(employee)} disabled={busy || saving || statusBusy || loading} title={`Click to ${employee.isActive ? "deactivate" : "activate"} ${employee.name}`} aria-label={`${employee.isActive ? "Deactivate" : "Activate"} ${employee.name}`} aria-haspopup="dialog">{employee.isActive ? "ACTIVE" : "INACTIVE"}</button></td><td><div className="eum-actions"><button type="button" className="btn btn-sm btn-primary" onClick={() => openEdit(employee)}>Edit</button></div></td></tr>)}
        {!current.length && <tr><td colSpan="7" className="eum-empty">{loading ? "Loading employees…" : "No employees match your search."}</td></tr>}
      </tbody></table></div>
      <ListPagination page={page} pageCount={pages} onChange={setPage}/>
    </section>

    <Modal
      open={Boolean(pendingStatusChange)}
      title="Confirm Employee Status Change"
      onClose={cancelStatusChange}
    >
      {pendingStatusChange && (
        <div>
          <p>
            Are you sure you want to {pendingStatusChange.nextIsActive ? "activate" : "deactivate"}{" "}
            <strong>{pendingStatusChange.name}</strong>?
          </p>
          <div className="alert alert-light border">
            <div><strong>Current status:</strong> {pendingStatusChange.currentIsActive ? "Active" : "Inactive"}</div>
            <div><strong>New status:</strong> {pendingStatusChange.nextIsActive ? "Active" : "Inactive"}</div>
          </div>
          {!pendingStatusChange.nextIsActive && (
            <p className="text-danger small">Deactivating this employee will block their access to the shop portal.</p>
          )}
          {statusError && <p role="alert" className="alert alert-danger">{statusError}</p>}
          <div className="d-flex justify-content-end gap-2 mt-4">
            <button type="button" className="btn btn-outline-secondary" onClick={cancelStatusChange} disabled={statusBusy}>Cancel</button>
            <button
              type="button"
              className={pendingStatusChange.nextIsActive ? "btn btn-success" : "btn btn-danger"}
              onClick={confirmStatusChange}
              disabled={statusBusy || busy || saving}
            >
              {statusBusy ? "Updating..." : pendingStatusChange.nextIsActive ? "Activate Employee" : "Deactivate Employee"}
            </button>
          </div>
        </div>
      )}
    </Modal>

    <Modal open={mode === "edit"} title={editing ? "Edit Shop Employee" : "Add Shop Employee"} onClose={close} className="eum-modal">
      <p className="eum-muted">{editing ? "Update employee information, role, permissions, salary and account access." : "Complete employee information and access setup."}</p>
      {error && <div role="alert" className="alert alert-danger">{error}</div>}
      {notice && <div role="status" className="alert alert-success">{notice}</div>}
      <form onSubmit={save} className="eum-form">
        <Section number="01" title="Personal Details"><div className="eum-grid"><label>Full name *<input className="form-control" required minLength="2" maxLength="100" value={form.name} onChange={e => set("name", e.target.value)}/></label><label>Email address{form.loginEnabled ? " *" : ""}<input className="form-control" type="email" required={form.loginEnabled} disabled={Boolean(editing?.userId)} value={form.email} onChange={e => set("email", e.target.value)}/></label><label>Mobile number *<input className="form-control" required minLength="7" maxLength="20" value={form.mobile} onChange={e => set("mobile", e.target.value)}/></label><label>Joining date *<input type="date" className="form-control" required value={form.joiningDate} onChange={e => set("joiningDate", e.target.value)}/></label>{editing && <label>Employment status<select className="form-select" value={String(form.isActive)} onChange={e => set("isActive", e.target.value === "true")}><option value="true">Active</option><option value="false">Inactive</option></select></label>}</div></Section>
        {editing?.userId && <p className="eum-muted">Login email is linked to an existing account. Contact an administrator to change it safely.</p>}
        <Section number="02" title="Employee Role">
          <div className="eum-role-select-row">
            <label className="eum-role-picker">Employee role *
              <select className="form-select" required value={form.role} onChange={e => selectRole(e.target.value)}>
                <option value="">Select role</option>
                {roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button type="button" className="btn btn-outline-primary" onClick={() => {setRoleInputOpen(v => !v);setError("");}} disabled={roleBusy}>+ Create</button>
          </div>
          {roleInputOpen && <div className="eum-inline-role">
            <label>New role name<input className="form-control" maxLength={80} placeholder="e.g. Warehouse Supervisor" value={newRoleName} onChange={e => setNewRoleName(e.target.value)}/></label>
            <button type="button" className="btn btn-primary" onClick={createInlineRole} disabled={!newRoleName.trim() || roleBusy}>{roleBusy ? "Adding..." : "Add Role"}</button>
            <button type="button" className="btn btn-outline-secondary" onClick={() => {setRoleInputOpen(false);setNewRoleName("");}} disabled={roleBusy}>Cancel</button>
          </div>}
        </Section>
        <Section number="03" title="Manage Permissions"><div className="eum-permission-head"><button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setExpandedPermissions(!expandedPermissions)}>{expandedPermissions ? "Hide checklist" : "Show checklist"}</button><span>{form.permissions.length} selected</span></div>{expandedPermissions && <><div className="eum-permission-actions"><button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { set("permissions", [...ALL_PERMISSIONS]); setPermissionsMode("custom"); }}>Select All</button><button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { set("permissions", []); setPermissionsMode("custom"); }}>Deselect All</button><button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { set("permissions", [...(PRESETS[form.role] || roleDefaults[form.role] || [])]); setPermissionsMode("defaults"); }}>Reset to Role</button></div><div className="eum-permission-grid">{PERMISSION_GROUPS.map(([group, rights]) => <div className="eum-permission-group" key={group}><strong>{group}</strong><div>{rights.map(([permission, label]) => <label key={permission} className="eum-permission-item"><input type="checkbox" checked={form.permissions.includes(permission)} onChange={() => toggle(permission)} disabled={permissionsLoading || !permissionReady}/><span>{label}</span></label>)}</div></div>)}</div></>}{permissionsLoading && <p className="eum-muted">Loading saved permissions…</p>}</Section>
        <Section number="04" title="Salary Setup"><div className="eum-grid"><label>{editing ? "Updated monthly salary (₹)" : "Starting monthly salary (₹)"}<input className="form-control" type="number" min="0.01" step="0.01" value={form.salary} onChange={e => set("salary", e.target.value)} placeholder="Required" required/></label><div className="eum-role-note"><strong>Salary history</strong><small>{editing ? "A changed salary creates a new history record." : "Starting salary is saved with the new employee."}</small></div></div></Section>
        <Section number="05" title="Login Account & Activation"><label className="eum-switch"><input type="checkbox" checked={form.loginEnabled} disabled={loginAccountCreated} onChange={e => set("loginEnabled", e.target.checked)}/><span>Create login account for this employee</span></label>{form.loginEnabled && <div className="eum-account-box"><p>Login email: <strong>{form.email || "Enter an email above"}</strong></p><p className="eum-muted">Employee sets a secure password using a one-time email link. No temporary password is stored or shown.</p>{editing && loginAccountCreated ? <><span className="eum-status eum-active">Login account linked</span><div className="eum-account-actions"><button type="button" className="btn btn-outline-primary" disabled={saving || actionBusy || !form.isActive} onClick={sendActivation}>{actionBusy ? "Sending…" : "Send / Resend Activation Link"}</button></div></> : <p className="eum-muted">{editing ? "Save to create a linked account, then send the activation email." : "The login account is created after employee details are saved. Open Edit to send the activation email."}</p>}</div>}</Section>
        <div className="eum-footer"><button type="button" className="btn btn-outline-secondary" onClick={close} disabled={saving}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving || busy || roleBusy || permissionsLoading || !permissionReady}>{saving ? "Saving…" : editing ? "Update Employee" : "Save Employee"}</button></div>
      </form>
    </Modal>


  </div>;
}
