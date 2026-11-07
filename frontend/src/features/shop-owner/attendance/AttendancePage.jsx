import { useEffect, useMemo, useState } from "react";
import { shopOwnerApi } from "../../../services/shopOwner/index.js";

const STATUSES = ["PRESENT", "ABSENT", "LEAVE"];
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const monthBounds = (month) => {
  const [year, part] = month.split("-").map(Number);
  return {
    from: `${month}-01`,
    to: `${year}-${String(part).padStart(2, "0")}-${String(new Date(year, part, 0).getDate()).padStart(2, "0")}`,
  };
};
const label = (status) => ({ PRESENT: "Present", ABSENT: "Absent", LEAVE: "Leave" }[status] || status);
const badgeClass = (status) =>
  status === "PRESENT" ? "bg-success-subtle text-success" :
  status === "ABSENT" ? "bg-danger-subtle text-danger" : "bg-warning-subtle text-dark";

export default function AttendancePage({ employees = [] }) {
  const [month, setMonth] = useState(todayLocal().slice(0, 7));
  const [day, setDay] = useState(todayLocal());
  const [employeeId, setEmployeeId] = useState("");
  const [status, setStatus] = useState("PRESENT");
  const [checkIn, setCheckIn] = useState("09:00");
  const [checkOut, setCheckOut] = useState("18:00");
  const [hours, setHours] = useState("8");
  const [note, setNote] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [records, setRecords] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null);
  const [editStatus, setEditStatus] = useState("PRESENT");
  const [editNote, setEditNote] = useState("");
  const [editHours, setEditHours] = useState("0");

  const employeeKey = employees.map((employee) => employee.id).join(",");
  const employeeLookup = useMemo(() =>
    new Map(employees.map((employee) => [employee.id, employee])), [employees]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!employees.length) { setRecords([]); return; }
      setLoading(true);
      setError("");
      const { from: start, to: end } = monthBounds(month);
      try {
        const results = await Promise.all(employees.map(async (employee) => {
          const query = `?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`;
          const response = await shopOwnerApi.employeeAttendance(employee.id, query);
          const items = Array.isArray(response) ? response : response.items || [];
          return items.map((record) => ({ ...record, employeeId: employee.id }));
        }));
        if (!cancelled) setRecords(results.flat().sort((a, b) => String(b.date).localeCompare(String(a.date))));
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load attendance.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // employeeKey detects changes to the employee list without refetching on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeKey, month, refreshKey]);

  const summary = useMemo(() => Object.fromEntries(STATUSES.map((s) =>
    [s, records.filter((r) => r.status === s).length])), [records]);
  const visible = useMemo(() => records.filter((record) => {
    const d = record.date?.slice(0, 10) || "";
    return (!from || d >= from) && (!to || d <= to) &&
      (!filterEmployee || record.employeeId === filterEmployee) &&
      (!filterStatus || record.status === filterStatus);
  }), [records, from, to, filterEmployee, filterStatus]);

  function refresh() { setRefreshKey((n) => n + 1); }

  async function recordAttendance(event) {
    event.preventDefault();
    if (!employeeId || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const present = status === "PRESENT";
      const payload = { date: day, status, note: note.trim(), workingHours: present ? Number(hours) : 0 };
      if (present && checkIn) payload.checkInAt = new Date(`${day}T${checkIn}:00`).toISOString();
      if (present && checkOut) payload.checkOutAt = new Date(`${day}T${checkOut}:00`).toISOString();
      await shopOwnerApi.recordAttendance(employeeId, payload);
      setNotice("Attendance recorded successfully.");
      setNote("");
      setMonth(day.slice(0, 7));
      refresh();
    } catch (err) {
      setError(err.message || "Could not record attendance.");
    } finally { setBusy(false); }
  }

  function startEdit(record) {
    setEditing(record); setEditStatus(record.status);
    setEditNote(record.note || ""); setEditHours(String(record.workingHours ?? 0));
    setError(""); setNotice("");
  }

  async function saveEdit() {
    if (!editing || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = {
        status: editStatus,
        note: editNote.trim(),
        workingHours: editStatus === "PRESENT" ? Number(editHours) : 0,
      };
      if (editStatus !== "PRESENT") {
        payload.checkInAt = null;
        payload.checkOutAt = null;
      }
      await shopOwnerApi.updateAttendance(editing.employeeId, editing.id, payload);
      setEditing(null);
      setNotice("Attendance correction saved.");
      refresh();
    } catch (err) {
      setError(err.message || "Could not update attendance.");
    } finally { setBusy(false); }
  }

  return (
    <section className="workspace-card" style={{ padding: 22 }}>
      <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap mb-3">
        <div><h2 className="mb-1">Attendance</h2><p className="text-muted mb-0">Record and correct attendance for employees in your shop.</p></div>
        <button className="btn btn-sm btn-outline-secondary" type="button" disabled={loading || busy} onClick={refresh}>Refresh</button>
      </div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      <div className="card border mb-4"><div className="card-body">
        <h5 className="mb-3">Record Attendance</h5>
        <form onSubmit={recordAttendance}>
          <div className="row g-3 align-items-end">
            <div className="col-12 col-md-4"><label className="form-label" htmlFor="att-employee">Employee *</label><select id="att-employee" className="form-select" required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} ({employee.employeeCode})</option>)}</select></div>
            <div className="col-12 col-md-4"><label className="form-label" htmlFor="att-date">Date *</label><input id="att-date" className="form-control" type="date" required value={day} onChange={(e) => setDay(e.target.value)} /></div>
            <div className="col-12 col-md-4"><label className="form-label" htmlFor="att-status">Status *</label><select id="att-status" className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
            <div className="col-12 col-md-3"><label className="form-label" htmlFor="att-hours">Working hours</label><input id="att-hours" className="form-control" type="number" min="0" max="24" step="0.25" disabled={status !== "PRESENT"} value={status === "PRESENT" ? hours : "0"} onChange={(e) => setHours(e.target.value)} /></div>
            <div className="col-12 col-md-3"><label className="form-label" htmlFor="att-in">Check-in</label><input id="att-in" className="form-control" type="time" disabled={status !== "PRESENT"} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></div>
            <div className="col-12 col-md-3"><label className="form-label" htmlFor="att-out">Check-out</label><input id="att-out" className="form-control" type="time" disabled={status !== "PRESENT"} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></div>
            <div className="col-12 col-md-3"><label className="form-label" htmlFor="att-note">Note</label><input id="att-note" className="form-control" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></div>
            <div className="col-12 d-flex justify-content-end"><button type="submit" className="btn btn-primary" disabled={busy || loading || !employees.length}>{busy ? "Saving..." : "Mark attendance"}</button></div>
          </div>
        </form>
      </div></div>

      <div className="row g-3 align-items-end mb-3">
        <div className="col-6 col-lg-2"><label className="form-label" htmlFor="att-month">Month summary</label><input id="att-month" type="month" className="form-control" value={month} onChange={(e) => { setMonth(e.target.value); setFrom(""); setTo(""); }} /></div>
        <div className="col-6 col-lg-2"><label className="form-label" htmlFor="att-from">From</label><input id="att-from" type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="col-6 col-lg-2"><label className="form-label" htmlFor="att-to">To</label><input id="att-to" type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="col-6 col-lg-4"><label className="form-label" htmlFor="att-filter-employee">Employee history</label><select id="att-filter-employee" className="form-select" value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)}><option value="">All employees</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></div>
        <div className="col-12 col-lg-2"><label className="form-label" htmlFor="att-filter-status">Status</label><select id="att-filter-status" className="form-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
      </div>
      <div className="d-flex flex-wrap gap-2 mb-3" aria-label="Monthly attendance totals">
        <span className="badge text-bg-light border">Present: {summary.PRESENT}</span><span className="badge text-bg-light border">Absent: {summary.ABSENT}</span><span className="badge text-bg-light border">Leave: {summary.LEAVE}</span>
      </div>
      <div className="card border"><div className="card-body">
        <div className="table-responsive"><table className="table table-hover align-middle mb-0">
          <thead className="table-light"><tr><th>Date</th><th>Employee</th><th>Status</th><th>Time</th><th>Hours</th><th>Note</th><th>Action</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan={7}>Loading attendance...</td></tr> : visible.length === 0 ? <tr><td colSpan={7} className="text-center text-muted py-4">No attendance records for these filters.</td></tr> : visible.map((record) => {
            const employee = employeeLookup.get(record.employeeId);
            const timeLabel = [record.checkInAt, record.checkOutAt].filter(Boolean).map((t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })).join(" - ");
            return <tr key={record.id}><td>{record.date?.slice(0, 10)}</td><td>{employee?.name || "Employee"}</td><td><span className={`badge ${badgeClass(record.status)}`}>{label(record.status)}</span></td><td>{timeLabel || "—"}</td><td>{record.workingHours ?? "—"}</td><td>{record.note || "—"}</td><td><button type="button" className="btn btn-sm btn-outline-primary" disabled={busy} onClick={() => startEdit(record)}>Edit</button></td></tr>;
          })}</tbody>
        </table></div>
      </div></div>

      {editing && <div className="card border mt-3"><div className="card-body">
        <h5>Edit Attendance</h5>
        <p className="text-muted">{employeeLookup.get(editing.employeeId)?.name} · {editing.date?.slice(0, 10)}</p>
        <div className="row g-3 mb-3">
          <div className="col-md-4"><label className="form-label" htmlFor="att-edit-status">Status</label><select id="att-edit-status" className="form-select" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
          <div className="col-md-4"><label className="form-label" htmlFor="att-edit-hours">Working hours</label><input id="att-edit-hours" className="form-control" type="number" min="0" max="24" step="0.25" disabled={editStatus !== "PRESENT"} value={editStatus === "PRESENT" ? editHours : "0"} onChange={(e) => setEditHours(e.target.value)} /></div>
          <div className="col-md-4"><label className="form-label" htmlFor="att-edit-note">Note</label><input id="att-edit-note" className="form-control" maxLength={500} value={editNote} onChange={(e) => setEditNote(e.target.value)} /></div>
        </div>
        <p className="small text-muted">Confirm the correction to update this attendance record.</p>
        <div className="d-flex justify-content-end gap-2"><button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={saveEdit}>{busy ? "Saving..." : "Confirm Update"}</button></div>
      </div></div>}
    </section>
  );
}
