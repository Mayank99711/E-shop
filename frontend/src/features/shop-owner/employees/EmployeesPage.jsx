import { Fragment, useState, useMemo,useEffect } from "react";
import { shopOwnerApi } from '../../../services/shopOwner/index.js';
import Modal from '../../../components/common/Modal.jsx';
import { ListPagination } from '../../../components/shopOwner/ListPagination.jsx';
import { EmployeeAttendancePayroll } from "./EmployeeAttendancePayroll.jsx";
import EmployeeManagement from "./EmployeeManagement.jsx";

export function EmployeesSection({ employees, section = "employees", busy, submit, error, reload, loading = false }) {
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [expandedEmployeeId, setExpandedEmployeeId] = useState(null);

  // Role assignment popup state
  const [roleEmployee, setRoleEmployee] = useState(null);
  const [selectedEmployeeRole, setSelectedEmployeeRole] = useState("");
  // Employee permission editor
const [permissionEmployee, setPermissionEmployee] = useState(null);
const [selectedPermissions, setSelectedPermissions] = useState([]);
const [permissionsLoading, setPermissionsLoading] = useState(false);
const [permissionsError, setPermissionsError] = useState("");

const permissionOptions = [
  { value: "dashboard.view", label: "View Dashboard" },
  { value: "orders.view", label: "View Orders" },
  { value: "orders.manage", label: "Manage Orders" },
  { value: "products.view", label: "View Products" },
  { value: "products.manage", label: "Manage Products" },
  { value: "inventory.view", label: "View Inventory" },
  { value: "inventory.manage", label: "Manage Inventory" },
  { value: "customers.view", label: "View Customers" },
  { value: "customers.manage", label: "Manage Customers" },
  { value: "delivery.view", label: "View Deliveries" },
  { value: "delivery.manage", label: "Manage Deliveries" },
  { value: "payments.view", label: "View Payments" },
  { value: "reports.view", label: "View Reports" },
  { value: "employees.view", label: "View Employees" },
  { value: "employees.manage", label: "Manage Employees" },
];
  const employeeRoleOptions = [
    { value: "SHOP_MANAGER", label: "Shop Manager" },
    { value: "SALES_STAFF", label: "Sales Staff" },
    { value: "INVENTORY_STAFF", label: "Inventory Staff" },
    { value: "DELIVERY_ASSOCIATE", label: "Delivery Associate" },
  ];

  function getEmployeeRoleLabel(role) {
    return (
      employeeRoleOptions.find((item) => item.value === role)?.label ||
      "Not assigned"
    );
  }

  // Stores the employee and requested status until confirmed.
const [pendingStatusChange, setPendingStatusChange] = useState(null);
  const pageSize = 10;
  const sectionTitles = {
    employees: "Employee management",
    attendance: "Employee attendance",
    salary: "Employee salary",
    payroll: "Employee payroll",
  };
  const filteredEmployees = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return employees
      .filter((employee) => statusFilter === "ALL" || String(employee.isActive) === statusFilter)
      .filter((employee) => !search || [employee.name, employee.employeeCode, employee.designation, employee.mobile, employee.email]
        .filter(Boolean).some((value) => value.toLocaleLowerCase().includes(search)))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [employees, query, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  const pageEmployees = filteredEmployees.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);
  useEffect(() => {
    if (section !== "employees") setExpandedEmployeeId(employees[0]?.id || null);
  }, [employees, section]);

  async function addEmployee(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = Object.fromEntries(form.entries());
    if (!body.email) delete body.email;
    if (!body.initialSalary) delete body.initialSalary;
    const result = await submit(() => shopOwnerApi.createEmployee(body), "Employee added.");
    if (result) {
      formElement.reset();
      setShowForm(false);
    }
  }


function requestStatusChange(employee, newStatus) {
  const nextIsActive = newStatus === "active";

  // No action when the selected status is unchanged.
  if (employee.isActive === nextIsActive) {
    return;
  }

  // Open confirmation popup. Do not call API yet.
  setPendingStatusChange({
    id: employee.id,
    name: employee.name,
    currentIsActive: employee.isActive,
    nextIsActive,
  });
}

async function confirmStatusChange() {
  if (!pendingStatusChange || busy) {
    return;
  }

  const { id, nextIsActive } = pendingStatusChange;

  const result = await submit(
    () => shopOwnerApi.updateEmployee(id, {
      isActive: nextIsActive,
    }),
    `Employee ${nextIsActive ? "activated" : "deactivated"} successfully.`
  );

  // Close only when the API request succeeds.
  if (result) {
    setPendingStatusChange(null);
  }
}

function cancelStatusChange() {
  if (!busy) {
    setPendingStatusChange(null);
  }
}

  function openRoleModal(employee) {
    setRoleEmployee(employee);
    setSelectedEmployeeRole(employee.employeeRole || "");
  }

  function closeRoleModal() {
    if (busy) return;

    setRoleEmployee(null);
    setSelectedEmployeeRole("");
  }

  async function confirmEmployeeRole() {
    if (!roleEmployee || busy) return;

    if (!selectedEmployeeRole) return;

    if (selectedEmployeeRole === roleEmployee.employeeRole) {
      closeRoleModal();
      return;
    }

    const result = await submit(
      () =>
        shopOwnerApi.assignEmployeeRole(
          roleEmployee.id,
          selectedEmployeeRole
        ),
      "Employee role updated successfully."
    );

    if (result) {
      closeRoleModal();
    }
  }
  async function openPermissionModal(employee) {
    if (busy || permissionsLoading) return;
    setPermissionEmployee(employee);
    setSelectedPermissions([]);
    setPermissionsError("");
    setPermissionsLoading(true);

    try {
      const response = await shopOwnerApi.getEmployeePermissions(employee.id);
      const permissions = response?.data?.permissions;
      if (!Array.isArray(permissions)) {
        throw new Error("The server returned invalid permissions.");
      }
      setSelectedPermissions(permissions);
    } catch (requestError) {
      setPermissionsError(requestError.message || "Could not load permissions.");
    } finally {
      setPermissionsLoading(false);
    }
  }

  function closePermissionModal() {
    if (busy || permissionsLoading) return;
    setPermissionEmployee(null);
    setSelectedPermissions([]);
    setPermissionsError("");
  }

  function togglePermission(permission) {
    if (busy || permissionsLoading || permissionsError) return;
    setSelectedPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission]
    );
  }

  async function saveEmployeePermissions() {
    if (!permissionEmployee || busy || permissionsLoading || permissionsError) return;

    const result = await submit(
      () => shopOwnerApi.updateEmployeePermissions(
        permissionEmployee.id,
        selectedPermissions,
      ),
      "Employee permissions updated successfully.",
    );

    if (result) closePermissionModal();
  }


  async function addSalary(event, employee) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = Object.fromEntries(form.entries());
    if (!body.note) delete body.note;
    await submit(() => shopOwnerApi.addEmployeeSalary(employee.id, body), "Salary history recorded.");
    formElement.reset();
  }

  if (section === "employees") return <EmployeeManagement employees={employees} busy={busy} reload={reload} loading={loading} />;

  return (
    <>
    {permissionEmployee && (
  <div className="auth-backdrop">
    <section
      className="auth-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="permission-modal-title"
      style={{ maxHeight: "85vh", overflowY: "auto" }}
    >
      <h2 id="permission-modal-title">
        Manage Permissions
      </h2>

      <p>
        Employee: <strong>{permissionEmployee.name}</strong>
      </p>

      <p className="muted-copy">
        Select which actions this employee can perform.
      </p>
      {permissionsLoading && (
  <p className="muted-copy">Loading employee permissions...</p>
)}

{permissionsError && (
  <p className="auth-error" role="alert">
    {permissionsError}
  </p>
)}

      <div className="d-flex flex-column gap-2">
        {permissionOptions.map((permission) => (
          <label
            key={permission.value}
            className="d-flex align-items-center gap-2"
          >
            <input
              type="checkbox"
              checked={selectedPermissions.includes(permission.value)}
              onChange={() => togglePermission(permission.value)}
              disabled={busy || permissionsLoading || Boolean(permissionsError)}
            />

            {permission.label}
          </label>
        ))}
      </div>

      <div className="d-flex gap-2 mt-4">
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={closePermissionModal}
          disabled={busy || permissionsLoading}
        >
          Cancel
        </button>

        <button
          type="button"
          className="btn btn-primary"
          onClick={saveEmployeePermissions}
          disabled={busy || permissionsLoading || Boolean(permissionsError)}
        >
          {busy ? "Saving..." : "Save Permissions"}
        </button>
      </div>
    </section>
  </div>
)}
    <section className="workspace-card">
      <div className="section-heading"><div><h2>{sectionTitles[section]} <span className="count-badge">{filteredEmployees.length} / {employees.length}</span></h2><p className="muted-copy">{section === "salary" ? "Salary history is visible only to this shop's owner." : "Employee records are scoped to your shop."}</p></div><div className="page-actions"><button className="btn btn-sm btn-outline-secondary icon-button" type="button" aria-label="Refresh data" title="Refresh data" disabled={loading} onClick={reload}>{"\u21BB"}</button>{section === "employees" && <button className="btn btn-primary" type="button" onClick={() => setShowForm(true)}>Add employee</button>}</div></div>
      <div className="list-filters">
        <label>Search employees<input className="form-control" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Name, employee code, role, or contact" /></label>
        <label>Status<select className="form-select" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="ALL">All employees</option><option value="true">Active</option><option value="false">Inactive</option></select></label>
      </div>
      {employees.length === 0
        ? <p className="muted-copy">No employees added yet.</p>
        : pageEmployees.length === 0
          ? <p className="muted-copy">No employees match these filters.</p>
          : <><div className="employee-table-wrap">
            <table className="employee-table">
              <thead>
                <tr>
                  <th scope="col">Employee Name</th>
                  <th scope="col">Employee Code</th>
                  <th scope="col">Role / Designation</th>
                  <th scope="col">Email</th>
                  <th scope="col">Phone Number</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageEmployees.map((employee) => {
                  const detailsId = `employee-details-${employee.id}`;
                  const isExpanded = expandedEmployeeId === employee.id;
                  const salaryHistory = employee.salaryHistory || [];
                  return (
                    <Fragment key={employee.id}>
                      <tr>
                        <td><strong>{employee.name}</strong></td>
                        <td>{employee.employeeCode || "—"}</td>

<td>
  <div className="d-flex flex-column align-items-start gap-1">
    <span>{employee.designation || "—"}</span>

    {section === "employees" && (
      <div className="d-flex align-items-center gap-2 flex-wrap">
  {/* Employee Role Button */}
  <button
    type="button"
    className="btn btn-sm btn-outline-primary"
    disabled={busy}
    onClick={() => openRoleModal(employee)}
    title={`Assign role for ${employee.name}`}
    aria-label={`Assign role for ${employee.name}`}
  >
    {getEmployeeRoleLabel(employee.employeeRole)}
    <span className="ms-2">✎</span>
  </button>

  {/* Manage Employee Permissions Button */}
  <button
    type="button"
    className="btn btn-sm btn-outline-primary"
    disabled={busy || !employee.employeeRole}
    onClick={() => openPermissionModal(employee)}
  >
    Manage Permissions
  </button>
</div>
    )}
  </div>
</td>

                        <td>{employee.email || "—"}</td>
                        <td>{employee.mobile || "—"}</td>

<td>
  <button
    type="button"
    className={`status-pill ${
      employee.isActive ? "active" : "inactive"
    }`}
    onClick={() =>
      requestStatusChange(
        employee,
        employee.isActive ? "inactive" : "active"
      )
    }
    disabled={busy}
    title={`Click to ${
      employee.isActive ? "deactivate" : "activate"
    } employee`}
    aria-label={`${
      employee.isActive ? "Deactivate" : "Activate"
    } ${employee.name}`}
    style={{
      border: "none",
      cursor: busy ? "not-allowed" : "pointer",
      fontFamily: "inherit",
    }}
  >
    {employee.isActive ? "ACTIVE" : "INACTIVE"}
  </button>
</td>

                        <td>
                          <div className="employee-actions">
                              {section === "employees" && employee.isActive && employee.employeeRole && employee.email && <>
                                <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => submit(() => shopOwnerApi.createEmployeeLoginAccount(employee.id), "Employee login account created. Now send an activation email.")}>Create Login Account</button>
                                <button type="button" className="btn btn-sm btn-outline-primary" disabled={busy} onClick={() => submit(() => shopOwnerApi.sendEmployeeActivation(employee.id), "Employee activation email sent.")}>Send Activation Email</button>
                              </>}
                            <button
                              className="btn btn-sm btn-outline-primary"
                              type="button"
                              aria-expanded={isExpanded}
                              aria-controls={detailsId}
                              onClick={() => setExpandedEmployeeId(isExpanded ? null : employee.id)}
                            >
                              {isExpanded ? "Hide details" : "View details"}
                            </button>


                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="employee-details-row">
                          <td colSpan={7}>
                            <div className="employee-details-panel" id={detailsId}>
                              <section>
                                <h3>Employee details</h3>
                                <dl className="employee-detail-grid">
                                  <div><dt>Name</dt><dd>{employee.name}</dd></div>
                                  <div><dt>Employee code</dt><dd>{employee.employeeCode || "—"}</dd></div>
                                  <div><dt>Role / designation</dt><dd>{employee.designation || "—"}</dd></div>
                                  <div><dt>Email</dt><dd>{employee.email || "—"}</dd></div>
                                  <div><dt>Phone number</dt><dd>{employee.mobile || "—"}</dd></div>
                                  <div><dt>Joining date</dt><dd>{employee.joiningDate ? new Date(employee.joiningDate).toLocaleDateString() : "—"}</dd></div>
                                </dl>
                              </section>
                              {section === "salary" && <section>
                                <h3>Salary history</h3>
                                {salaryHistory.length > 0
                                  ? <ul className="salary-history">{salaryHistory.map((record) => <li key={record.id}>₹{record.amount} · effective {new Date(record.effectiveFrom).toLocaleDateString()}{record.note ? ` · ${record.note}` : ""}</li>)}</ul>
                                  : <p className="muted-copy">No salary history recorded yet.</p>}
                                <form className="salary-form" onSubmit={(event) => addSalary(event, employee)}>
                                  <label>Monthly amount<input className="form-control" name="amount" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" /></label>
                                  <label>Effective from<input className="form-control" name="effectiveFrom" type="date" required /></label>
                                  <label>Note (optional)<input className="form-control" name="note" maxLength="500" /></label>
                                  <button className="btn btn-sm btn-outline-primary" disabled={busy}>Record change</button>
                                </form>
                              </section>}
                              {(section === "attendance" || section === "payroll") && <EmployeeAttendancePayroll employee={employee} mode={section} />}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div><ListPagination page={page} pageCount={pageCount} onChange={setPage} /></>}
    </section>
    <Modal open={showForm} title="Add shop employee" onClose={() => setShowForm(false)} >

      {error && <p className="alert alert-danger" role="alert">{error}</p>}
      <form className="employee-form workspace-form" onSubmit={addEmployee}>
        <label>Name<input className="form-control" name="name" required minLength="2" maxLength="100" /></label>
        <label>Email (optional)<input className="form-control" name="email" type="email" maxLength="254" /></label>
        <label>Mobile<input className="form-control" name="mobile" required minLength="7" maxLength="20" /></label>
        <label>Designation<input className="form-control" name="designation" required minLength="2" maxLength="100" /></label>
        <label>Joining date<input className="form-control" name="joiningDate" type="date" required /></label>
        <label>Starting monthly salary (optional)<input className="form-control" name="initialSalary" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" /></label>
        <button className="btn btn-primary" disabled={busy}>Save employee</button>
      </form>
    </Modal>
    {/* Employee status confirmation popup */}
<Modal
  open={Boolean(pendingStatusChange)}
  title="Confirm Employee Status Change"
  onClose={cancelStatusChange}
>
  {pendingStatusChange && (
    <div>
    {error && (
  <p className="alert alert-danger" role="alert">
    {error}
  </p>
)}
      <p className="mb-2">
        Are you sure you want to change the status of{" "}
        <strong>{pendingStatusChange.name}</strong>?
      </p>

      <div className="alert alert-light border">
        <strong>Current Status: </strong>
        {pendingStatusChange.currentIsActive
          ? "Active"
          : "Inactive"}

        <div className="mt-2">
          <strong>New Status: </strong>
          <span
            className={
              pendingStatusChange.nextIsActive
                ? "text-success fw-bold"
                : "text-danger fw-bold"
            }
          >
            {pendingStatusChange.nextIsActive
              ? "Active"
              : "Inactive"}
          </span>
        </div>
      </div>

      {!pendingStatusChange.nextIsActive && (
        <p className="text-danger small">
          This employee will be marked as inactive.
        </p>
      )}

      <div className="d-flex justify-content-end gap-2 mt-4">
        <button
          type="button"
          className="btn btn-outline-secondary"
          disabled={busy}
          onClick={cancelStatusChange}
        >
          Cancel
        </button>

        <button
          type="button"
          className={
            pendingStatusChange.nextIsActive
              ? "btn btn-success"
              : "btn btn-danger"
          }
          disabled={busy}
          onClick={confirmStatusChange}
        >
          {busy
            ? "Updating..."
            : "Confirm Change"}
        </button>
      </div>
    </div>
  )}
</Modal>

      {/* Employee Role Assignment Modal */}
      <Modal
        open={Boolean(roleEmployee)}
        title="Assign Employee Role"
        onClose={closeRoleModal}
      >
        {roleEmployee && (
          <div>
            <p className="mb-3">
              Employee: <strong>{roleEmployee.name}</strong>
            </p>

            {error && (
              <div className="alert alert-danger" role="alert">
                {error}
              </div>
            )}

            <div className="mb-3">
              <label
                htmlFor="employee-role-select"
                className="form-label fw-semibold"
              >
                Select Employee Role
              </label>

              <select
                id="employee-role-select"
                className="form-select"
                value={selectedEmployeeRole}
                disabled={busy}
                onChange={(event) =>
                  setSelectedEmployeeRole(event.target.value)
                }
              >
                <option value="">Select role</option>

                {employeeRoleOptions.map((role) => (
                  <option
                    key={role.value}
                    value={role.value}
                  >
                    {role.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="alert alert-light border">
              <div>
                <strong>Current Role:</strong>{" "}
                {getEmployeeRoleLabel(roleEmployee.employeeRole)}
              </div>

              <div className="mt-2">
                <strong>New Role:</strong>{" "}
                {getEmployeeRoleLabel(selectedEmployeeRole)}
              </div>
            </div>

            {roleEmployee.employeeRole &&
              selectedEmployeeRole !== roleEmployee.employeeRole && (
                <p className="text-muted small">
                  Changing this role will reset any existing custom
                  permission overrides to the new role defaults.
                </p>
              )}

            <div className="d-flex justify-content-end gap-2 mt-4">
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={busy}
                onClick={closeRoleModal}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  busy ||
                  !selectedEmployeeRole ||
                  selectedEmployeeRole === roleEmployee.employeeRole
                }
                onClick={confirmEmployeeRole}
              >
                {busy ? "Updating..." : "Confirm Role Change"}
              </button>
            </div>
          </div>
        )}
      </Modal>


    </>
  );
}
