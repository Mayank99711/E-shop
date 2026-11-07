
import { useState, useEffect, useRef } from "react";
import { shopOwnerApi } from "../../services/shopOwner/index.js";

export function EmployeeAttendancePayroll({
  employee,
  mode = "all",
}) {
  // Attendance state
  const [attendance, setAttendance] = useState([]);
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("PRESENT");

  // Edit attendance state
  const [editingAttendance, setEditingAttendance] = useState(null);
  const [editStatus, setEditStatus] = useState("PRESENT");

  // Payroll state
  const [periods, setPeriods] = useState([]);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [amountDue, setAmountDue] = useState("");

  // Salary payment state
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentPeriodId, setPaymentPeriodId] = useState("");
  const paymentKeyRef = useRef(null);

  // Common state
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Load attendance and payroll
  async function load() {
    setLoading(true);

    try {
      if (mode === "attendance" || mode === "all") {
        const result = await shopOwnerApi.employeeAttendance(
          employee.id
        );

        setAttendance(result.items || result || []);
      }

      if (mode === "payroll" || mode === "all") {
        const result = await shopOwnerApi.employeePayrollPeriods(
          employee.id
        );

        setPeriods(result.items || result || []);
      }

      setError("");
    } catch (e) {
      setError(e.message || "Failed to load employee records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [employee.id, mode]);

  // Record new attendance
  async function recordAttendance(event) {
    event.preventDefault();

    if (busy || !date) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await shopOwnerApi.recordAttendance(employee.id, {
        date,
        status,
      });

      setDate("");
      setStatus("PRESENT");

      await load();

      setNotice("Attendance recorded successfully.");
    } catch (e) {
      setError(e.message || "Failed to record attendance.");
    } finally {
      setBusy(false);
    }
  }

  // Open edit attendance form
  function openEditAttendance(record) {
    setError("");
    setNotice("");

    setEditingAttendance(record);
    setEditStatus(record.status);
  }

  // Cancel attendance editing
  function closeEditAttendance() {
    if (busy) return;

    setEditingAttendance(null);
    setEditStatus("PRESENT");
  }

  // Update existing attendance
  async function saveEditedAttendance() {
    if (!editingAttendance || busy) return;

    if (editStatus === editingAttendance.status) {
      closeEditAttendance();
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await shopOwnerApi.updateAttendance(
        employee.id,
        editingAttendance.id,
        {
          status: editStatus,
        }
      );

      setEditingAttendance(null);
      setEditStatus("PRESENT");

      await load();

      setNotice("Attendance updated successfully.");
    } catch (e) {
      setError(e.message || "Failed to update attendance.");
    } finally {
      setBusy(false);
    }
  }

  // Create payroll period
  async function createPeriod(event) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await shopOwnerApi.createPayrollPeriod(employee.id, {
        periodStart,
        periodEnd,
        amountDue,
      });

      setPeriodStart("");
      setPeriodEnd("");
      setAmountDue("");

      await load();

      setNotice("Payroll period created successfully.");
    } catch (e) {
      setError(e.message || "Failed to create payroll period.");
    } finally {
      setBusy(false);
    }
  }

  // Record salary payment
  async function recordPayment(event) {
    event.preventDefault();

    if (busy || !paymentPeriodId) return;

    if (!paymentKeyRef.current) {
      paymentKeyRef.current = crypto.randomUUID();
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await shopOwnerApi.recordPayrollPayment(
        paymentPeriodId,
        {
          amount: paymentAmount,
          idempotencyKey: paymentKeyRef.current,
        }
      );

      setPaymentAmount("");
      paymentKeyRef.current = null;

      await load();

      setNotice("Salary payment recorded successfully.");
    } catch (e) {
      setError(e.message || "Failed to record salary payment.");
    } finally {
      setBusy(false);
    }
  }

  // Attendance badge style
  function getAttendanceBadge(statusValue) {
    switch (statusValue) {
      case "PRESENT":
        return "bg-success";
      case "ABSENT":
        return "bg-danger";
      case "LEAVE":
        return "bg-warning text-dark";
      default:
        return "bg-secondary";
    }
  }

  return (
    <div className="employee-attendance-payroll">

      {/* Common messages */}
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      )}

      {/* ATTENDANCE MANAGEMENT */}
      {(mode === "attendance" || mode === "all") && (
        <section className="mb-4">

          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <h4 className="mb-1">Employee Attendance</h4>
              <p className="text-muted small mb-0">
                Manage attendance for {employee.name}
              </p>
            </div>

            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={busy || loading}
              onClick={load}
            >
              Refresh
            </button>
          </div>

          {/* Record attendance */}
          <div className="card border mb-4">
            <div className="card-body">
              <h5 className="card-title mb-3">
                Record Attendance
              </h5>

              <form onSubmit={recordAttendance}>
                <div className="row g-3 align-items-end">

                  <div className="col-md-5">
                    <label className="form-label">
                      Attendance Date
                    </label>

                    <input
                      className="form-control"
                      type="date"
                      required
                      value={date}
                      disabled={busy}
                      onChange={(event) =>
                        setDate(event.target.value)
                      }
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">
                      Attendance Status
                    </label>

                    <select
                      className="form-select"
                      value={status}
                      disabled={busy}
                      onChange={(event) =>
                        setStatus(event.target.value)
                      }
                    >
                      <option value="PRESENT">Present</option>
                      <option value="ABSENT">Absent</option>
                      <option value="LEAVE">Leave</option>
                    </select>
                  </div>

                  <div className="col-md-3">
                    <button
                      type="submit"
                      className="btn btn-primary w-100"
                      disabled={busy}
                    >
                      {busy ? "Saving..." : "Record Attendance"}
                    </button>
                  </div>

                </div>
              </form>
            </div>
          </div>

          {/* Attendance history */}
          <div className="card border">
            <div className="card-body">

              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="mb-0">
                  Attendance History
                </h5>

                <span className="badge bg-secondary">
                  {attendance.length} Records
                </span>
              </div>

              {loading ? (
                <p className="text-muted">
                  Loading attendance records...
                </p>
              ) : attendance.length === 0 ? (
                <p className="text-muted mb-0">
                  No attendance records available.
                </p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle">

                    <thead className="table-light">
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Employee</th>
                        <th scope="col">Status</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {attendance.map((record) => (
                        <tr key={record.id}>

                          <td>
                            {record.date?.slice(0, 10) || "—"}
                          </td>

                          <td>
                            <strong>{employee.name}</strong>
                            <div className="text-muted small">
                              {employee.employeeCode || ""}
                            </div>
                          </td>

                          <td>
                            <span
                              className={`badge ${getAttendanceBadge(
                                record.status
                              )}`}
                            >
                              {record.status}
                            </span>
                          </td>

                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              disabled={busy}
                              onClick={() =>
                                openEditAttendance(record)
                              }
                            >
                              Edit
                            </button>
                          </td>

                        </tr>
                      ))}
                    </tbody>

                  </table>
                </div>
              )}

            </div>
          </div>

          {/* Edit attendance confirmation form */}
          {editingAttendance && (
            <div className="card border mt-3">
              <div className="card-body">

                <h5 className="mb-3">
                  Edit Attendance
                </h5>

                <p className="mb-2">
                  <strong>Employee:</strong> {employee.name}
                </p>

                <p className="mb-3">
                  <strong>Date:</strong>{" "}
                  {editingAttendance.date?.slice(0, 10)}
                </p>

                <div className="mb-3">
                  <label
                    className="form-label"
                    htmlFor={`edit-attendance-${employee.id}`}
                  >
                    Change Attendance Status
                  </label>

                  <select
                    id={`edit-attendance-${employee.id}`}
                    className="form-select"
                    value={editStatus}
                    disabled={busy}
                    onChange={(event) =>
                      setEditStatus(event.target.value)
                    }
                  >
                    <option value="PRESENT">Present</option>
                    <option value="ABSENT">Absent</option>
                    <option value="LEAVE">Leave</option>
                  </select>
                </div>

                <div className="alert alert-light border">
                  <div>
                    <strong>Current Status:</strong>{" "}
                    {editingAttendance.status}
                  </div>

                  <div className="mt-2">
                    <strong>New Status:</strong>{" "}
                    <span
                      className={`badge ${getAttendanceBadge(
                        editStatus
                      )}`}
                    >
                      {editStatus}
                    </span>
                  </div>
                </div>

                <p className="text-muted small">
                  Are you sure you want to update this
                  attendance record?
                </p>

                <div className="d-flex justify-content-end gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    disabled={busy}
                    onClick={closeEditAttendance}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={
                      busy ||
                      editStatus === editingAttendance.status
                    }
                    onClick={saveEditedAttendance}
                  >
                    {busy ? "Updating..." : "Confirm Update"}
                  </button>
                </div>

              </div>
            </div>
          )}

        </section>
      )}

      {/* PAYROLL PERIOD MANAGEMENT */}
      {(mode === "payroll" || mode === "all") && (
        <section className="mb-4">
          <h4>Payroll Periods</h4>

          <form
            onSubmit={createPeriod}
            className="d-flex gap-2 flex-wrap mb-3"
          >
            <input
              className="form-control"
              type="date"
              required
              value={periodStart}
              disabled={busy}
              onChange={(event) =>
                setPeriodStart(event.target.value)
              }
            />

            <input
              className="form-control"
              type="date"
              required
              value={periodEnd}
              disabled={busy}
              onChange={(event) =>
                setPeriodEnd(event.target.value)
              }
            />

            <input
              className="form-control"
              placeholder="Amount due"
              required
              value={amountDue}
              disabled={busy}
              onChange={(event) =>
                setAmountDue(event.target.value)
              }
            />

            <button
              className="btn btn-sm btn-primary"
              disabled={busy}
            >
              {busy ? "Saving..." : "Create Period"}
            </button>
          </form>

          {periods.length === 0 ? (
            <p className="muted-copy">
              No payroll periods.
            </p>
          ) : (
            <ul className="salary-history">
              {periods.map((period) => (
                <li key={period.id}>
                  {period.periodStart?.slice(0, 10)}
                  {" to "}
                  {period.periodEnd?.slice(0, 10)}
                  {" - due "}
                  {period.amountDue}
                  {" - "}
                  {period.status}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* SALARY PAYMENT */}
      {(mode === "payroll" || mode === "all") && (
        <section>
          <h4>Record Salary Payment</h4>

          <form
            onSubmit={recordPayment}
            className="d-flex gap-2 flex-wrap mb-3"
          >
            <select
              className="form-control"
              required
              value={paymentPeriodId}
              disabled={busy}
              onChange={(event) => {
                setPaymentPeriodId(event.target.value);
                paymentKeyRef.current = null;
              }}
            >
              <option value="">Select period</option>

              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.periodStart?.slice(0, 10)}
                  {" (due "}
                  {period.amountDue}
                  {")"}
                </option>
              ))}
            </select>

            <input
              className="form-control"
              placeholder="Amount"
              required
              value={paymentAmount}
              disabled={busy}
              onChange={(event) => {
                setPaymentAmount(event.target.value);
                paymentKeyRef.current = null;
              }}
            />

            <button
              className="btn btn-sm btn-primary"
              disabled={busy || !paymentPeriodId}
            >
              {busy ? "Saving..." : "Record Payment"}
            </button>
          </form>
        </section>
      )}

    </div>
  );
}
