import { WholesaleRecordDetails } from "./WholesaleRecordDetails.jsx";
import { useEffect, useMemo, useState } from "react";
import {
  shopOwnerApi,
  apiRequest,
} from "../../services/shopOwner/index.js";
const MAX_FILE_SIZE = 8 * 1024 * 1024;

const initialForm = {
  purchaseOrderId: "",
  invoiceNumber: "",
  invoiceDate: "",
  amount: "",
  notes: "",
};

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function dateText(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleDateString("en-IN");
}

function statusClass(status) {
  if (status === "PAID") return "bg-success-subtle text-success";
  if (status === "PARTIALLY_PAID") return "bg-warning-subtle text-warning-emphasis";
  if (status === "CANCELLED") return "bg-secondary-subtle text-secondary";
  return "bg-danger-subtle text-danger";
}

export function UploadBillsSection({ wholesalerId = null }) {
  const [selectedBill,setSelectedBill]=useState(null);
  const [bills, setBills] = useState([]);
  const [orders, setOrders] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [invoiceFile, setInvoiceFile] = useState(null);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const [billResponse, orderResponse] = await Promise.all([
        shopOwnerApi.wholesaleBills(),
        shopOwnerApi.purchaseOrders(),
      ]);

      setBills(billResponse.items || []);
      setOrders(orderResponse.items || []);
    } catch (requestError) {
      setError(requestError.message || "Unable to load invoices.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function fetchData() {
      try {
        const [billResponse, orderResponse] = await Promise.all([
          shopOwnerApi.wholesaleBills(),
          shopOwnerApi.purchaseOrders(),
        ]);

        if (!active) return;

        setBills(billResponse.items || []);
        setOrders(orderResponse.items || []);
      } catch (requestError) {
        if (active) {
          setError(requestError.message || "Unable to load invoices.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchData();

    return () => {
      active = false;
    };
  }, []);

  const availableOrders = useMemo(
    () => orders.filter((po) => po.status !== "CANCELLED" && (!wholesalerId || po.wholesalerId === wholesalerId)),
    [orders, wholesalerId]
  );

  const filteredBills = useMemo(() => {
    const query = search.trim().toLowerCase();

    return bills.filter((bill) => {
      if (wholesalerId && bill.wholesalerId !== wholesalerId) return false;
      const matchesStatus =
        status === "ALL" || bill.status === status;

      const searchable = [
        bill.invoiceNumber,
        bill.wholesaler?.name,
        bill.wholesaler?.code,
        bill.purchaseOrderId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesStatus && searchable.includes(query);
    });
  }, [bills, search, status, wholesalerId]);

  const totals = useMemo(() => {
    return bills.filter(bill => !wholesalerId || bill.wholesalerId === wholesalerId).reduce(
      (result, bill) => {
        if (bill.status === "CANCELLED") return result;

        result.total += Number(bill.amount || 0);
        result.paid += Number(bill.paidAmount || 0);
        result.outstanding += Number(bill.outstandingAmount || 0);
        return result;
      },
      { total: 0, paid: 0, outstanding: 0 }
    );
  }, [bills]);

  function openModal() {
    setForm({
      ...initialForm,
      invoiceDate: new Date().toLocaleDateString("en-CA"),
    });

    setInvoiceFile(null);
    setError("");
    setShowModal(true);
  }

  function closeModal() {
    if (busy) return;
    setShowModal(false);
    setInvoiceFile(null);
  }

  function updateField(field, value) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function selectFile(event) {
    const file = event.target.files?.[0] || null;

    if (file && file.size > MAX_FILE_SIZE) {
      setError("Invoice file cannot exceed 8 MB.");
      setInvoiceFile(null);
      event.target.value = "";
      return;
    }

    setError("");
    setInvoiceFile(file);
  }

  async function handleUpload(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!invoiceFile) {
      setError("Please select an invoice file.");
      return;
    }

    if (Number(form.amount) <= 0) {
      setError("Bill amount must be greater than zero.");
      return;
    }

    const body = new FormData();

    body.append("purchaseOrderId", form.purchaseOrderId);
    body.append("invoiceNumber", form.invoiceNumber.trim());
    body.append("invoiceDate", form.invoiceDate);
    body.append("amount", Number(form.amount).toFixed(2));
    body.append("notes", form.notes.trim());
    body.append("file", invoiceFile);

    setBusy(true);

    try {
      await shopOwnerApi.uploadWholesaleBill(body);

      setShowModal(false);
      setInvoiceFile(null);
      setForm(initialForm);
      setNotice("Invoice uploaded successfully.");

      await load();
    } catch (requestError) {
      setError(requestError.message || "Invoice upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadInvoice(bill) {
    setError("");

    try {
      const { apiBaseUrl } = await import("../../services/apiClient.js");

const response = await fetch(
  `${apiBaseUrl}/api/owner/wholesale-bills/${bill.id}/file`,
  {
    credentials: "include",
    headers: {
      "x-eshop-portal": "shop-owner",
    },
  }
);

if (!response.ok) {
  throw new Error("Unable to download invoice.");
}

const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        bill.originalFileName || "wholesale-invoice";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError.message);
    }
  }

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <h5 className="fw-semibold mb-1">Upload Bills</h5>
          <p className="text-muted small mb-0">
            Track wholesaler invoices and outstanding amounts.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={openModal}
        >
          + Upload Bill
        </button>
      </div>

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

      <div className="row g-3 mb-4">
        {[
          { label: "Total Invoices", value: bills.length },
          { label: "Total Billed", value: money(totals.total) },
          { label: "Amount Paid", value: money(totals.paid) },
          {
            label: "Outstanding",
            value: money(totals.outstanding),
          },
        ].map((card) => (
          <div className="col-12 col-sm-6 col-xl-3" key={card.label}>
            <div className="card border h-100">
              <div className="card-body">
                <div className="small text-muted mb-2">
                  {card.label}
                </div>
                <h5 className="fw-bold mb-0">{card.value}</h5>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="d-flex flex-wrap gap-3 mb-3">
        <input
          type="search"
          className="form-control"
          style={{ maxWidth: 320 }}
          placeholder="Search invoice or wholesaler..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search invoices"
        />

        <select
          className="form-select"
          style={{ maxWidth: 220 }}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Filter invoice status"
        >
          <option value="ALL">All Statuses</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PARTIALLY_PAID">Partially Paid</option>
          <option value="PAID">Paid</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={load}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="workspace-state">Loading invoices...</div>
      ) : filteredBills.length === 0 ? (
        <div className="empty-state text-center py-5">
          {search || status !== "ALL"
            ? "No matching invoices found."
            : "No invoices uploaded yet."}
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover align-middle workspace-table">
            <thead className="table-light">
              <tr>
                <th>Invoice No.</th>
                <th>Details</th>
                 <th>Wholesaler</th>
                <th>Invoice Date</th>
                <th className="text-end">Bill Amount</th>
                <th className="text-end">Paid</th>
                <th className="text-end">Outstanding</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredBills.map((bill) => (
                <tr key={bill.id}><td><button type="button" className="btn btn-sm btn-outline-primary" onClick={()=>setSelectedBill(bill)}>View</button></td>
                  <td className="fw-semibold">
                    {bill.invoiceNumber}
                  </td>

                  <td>
                    <div>{bill.wholesaler?.name || "-"}</div>
                    <small className="text-muted">
                      {bill.wholesaler?.code || ""}
                    </small>
                  </td>

                  <td>{dateText(bill.invoiceDate)}</td>

                  <td className="text-end">
                    {money(bill.amount)}
                  </td>

                  <td className="text-end">
                    {money(bill.paidAmount)}
                  </td>

                  <td className="text-end fw-semibold">
                    {money(bill.outstandingAmount)}
                  </td>

                  <td>
                    <span
                      className={`badge ${statusClass(bill.status)}`}
                    >
                      {bill.status.replaceAll("_", " ")}
                    </span>
                  </td>

                  <td>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => downloadInvoice(bill)}
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedBill && <WholesaleRecordDetails title={`Bill — ${selectedBill.invoiceNumber}`} rows={[["Wholesaler",selectedBill.wholesaler?.name],["Invoice",selectedBill.invoiceNumber],["Date",String(selectedBill.invoiceDate||"").slice(0,10)],["Amount",money(selectedBill.amount)],["Outstanding",money(selectedBill.outstandingAmount)],["Status",selectedBill.status]]} notes={selectedBill.notes} onSave={async notes=>{await shopOwnerApi.updateBillNotes(selectedBill.id,{notes});await reload();}} onClose={()=>setSelectedBill(null)}/>}
       {showModal && (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.65)",
            display: "grid",
            placeItems: "center",
            zIndex: 1055,
            padding: 16,
          }}
        >
          <div
            className="card shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-bill-title"
            style={{
              width: "min(650px, 100%)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div className="card-header bg-white d-flex justify-content-between align-items-center py-3">
              <div>
                <h5 id="upload-bill-title" className="fw-bold mb-1">
                  Upload Wholesaler Bill
                </h5>
                <p className="text-muted small mb-0">
                  Attach an invoice against an existing purchase order.
                </p>
              </div>

              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                onClick={closeModal}
                disabled={busy}
              />
            </div>

            <form onSubmit={handleUpload}>
              <div className="card-body">
                <div className="mb-3">
                  <label
                    className="form-label"
                    htmlFor="bill-purchase-order"
                  >
                    Purchase Order *
                  </label>

                  <select
                    id="bill-purchase-order"
                    className="form-select"
                    required
                    value={form.purchaseOrderId}
                    onChange={(event) =>
                      updateField(
                        "purchaseOrderId",
                        event.target.value
                      )
                    }
                  >
                    <option value="">Select Purchase Order</option>

                    {availableOrders.map((po) => (
                      <option key={po.id} value={po.id}>
                        {po.wholesaler?.name || "Wholesaler"} —
                        {" "}
                        {po.id.slice(0, 8)}
                        {" "}
                        ({money(po.totalAmount)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="row g-3 mb-3">
                  <div className="col-md-6">
                    <label
                      className="form-label"
                      htmlFor="bill-invoice-number"
                    >
                      Invoice Number *
                    </label>
                    <input
                      id="bill-invoice-number"
                      className="form-control"
                      required
                      maxLength={100}
                      value={form.invoiceNumber}
                      onChange={(event) =>
                        updateField(
                          "invoiceNumber",
                          event.target.value
                        )
                      }
                      placeholder="INV-2026-001"
                    />
                  </div>

                  <div className="col-md-6">
                    <label
                      className="form-label"
                      htmlFor="bill-invoice-date"
                    >
                      Invoice Date *
                    </label>
                    <input
                      id="bill-invoice-date"
                      className="form-control"
                      type="date"
                      required
                      value={form.invoiceDate}
                      onChange={(event) =>
                        updateField(
                          "invoiceDate",
                          event.target.value
                        )
                      }
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label
                    className="form-label"
                    htmlFor="bill-amount"
                  >
                    Bill Amount (INR) *
                  </label>
                  <input
                    id="bill-amount"
                    className="form-control"
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={(event) =>
                      updateField("amount", event.target.value)
                    }
                    placeholder="1500.00"
                  />
                </div>

                <div className="mb-3">
                  <label
                    className="form-label"
                    htmlFor="bill-file"
                  >
                    Invoice Attachment *
                  </label>
                  <input
                    id="bill-file"
                    className="form-control"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    required
                    onChange={selectFile}
                  />
                  <div className="form-text">
                    PDF, JPG or PNG. Maximum 8 MB.
                  </div>
                </div>

                <div className="mb-2">
                  <label
                    className="form-label"
                    htmlFor="bill-notes"
                  >
                    Notes (Optional)
                  </label>
                  <textarea
                    id="bill-notes"
                    className="form-control"
                    rows={3}
                    maxLength={1000}
                    value={form.notes}
                    onChange={(event) =>
                      updateField("notes", event.target.value)
                    }
                    placeholder="Additional invoice information..."
                  />
                </div>
              </div>

              <div className="card-footer bg-white d-flex justify-content-end gap-2 py-3">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={closeModal}
                  disabled={busy}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || availableOrders.length === 0}
                >
                  {busy ? "Uploading..." : "Upload Bill"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
