import { WholesaleRecordDetails } from "./WholesaleRecordDetails.jsx";
import { useEffect, useMemo, useState } from "react";
import { shopOwnerApi } from "../../services/shopOwner/index.js";

const METHODS = {
  CASH: "Cash",
  UPI: "UPI",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
};

const INITIAL_FORM = {
  billId: "",
  amount: "",
  method: "UPI",
  paymentDate: "",
  transactionReference: "",
  notes: "",
  idempotencyKey: "",
};

function todayLocal() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function displayDate(value) {
  if (!value) return "-";

  const datePart = String(value).slice(0, 10);
  const [year, month, day] = datePart.split("-");

  return year && month && day
    ? `${day}/${month}/${year}`
    : "-";
}

function paymentBadge(method) {
  if (method === "UPI") return "bg-primary-subtle text-primary";
  if (method === "BANK_TRANSFER")
    return "bg-info-subtle text-info-emphasis";
  if (method === "CASH")
    return "bg-success-subtle text-success";
  return "bg-secondary-subtle text-secondary";
}

export function PaymentHistorySection({ wholesalerId = null }) {
  const [selectedPayment,setSelectedPayment]=useState(null);
  const [payments, setPayments] = useState([]);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("ALL");

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  async function reload() {
    setLoading(true);

    try {
      const [paymentResponse, billResponse] = await Promise.all([
        shopOwnerApi.wholesalePayments(),
        shopOwnerApi.wholesaleBills(),
      ]);

      setPayments(paymentResponse.items || []);
      setBills(billResponse.items || []);
      setError("");
    } catch (requestError) {
      setError(
        requestError.message || "Unable to load payment history."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    Promise.all([
      shopOwnerApi.wholesalePayments(),
      shopOwnerApi.wholesaleBills(),
    ])
      .then(([paymentResponse, billResponse]) => {
        if (!active) return;

        setPayments(paymentResponse.items || []);
        setBills(billResponse.items || []);
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError.message || "Unable to load payments."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const payableBills = useMemo(
    () =>
      bills.filter(
        (bill) =>
          bill.status !== "CANCELLED" &&
          (!wholesalerId || bill.wholesalerId === wholesalerId) &&
          Number(bill.outstandingAmount) > 0
      ),
    [bills, wholesalerId]
  );

  const selectedBill = useMemo(
    () => bills.find((bill) => bill.id === form.billId),
    [bills, form.billId]
  );

  const filteredPayments = useMemo(() => {
    const query = search.trim().toLowerCase();

    return payments.filter((payment) => {
      if (wholesalerId && payment.wholesaler?.id !== wholesalerId && payment.bill?.wholesaler?.id !== wholesalerId) return false;
      if (
        methodFilter !== "ALL" &&
        payment.method !== methodFilter
      ) {
        return false;
      }

      const searchable = [
        payment.invoiceNumber,
        payment.bill?.invoiceNumber,
        payment.wholesaler?.name,
        payment.bill?.wholesaler?.name,
        payment.transactionReference,
        payment.method,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [payments, search, methodFilter, wholesalerId]);

  const summary = useMemo(() => {
    const currentPayments = payments.filter(p => !wholesalerId || p.wholesaler?.id === wholesalerId);
    const currentBills = bills.filter(b => !wholesalerId || b.wholesalerId === wholesalerId);
    const recordedAmount = currentPayments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    );

    const outstandingAmount = currentBills.reduce(
      (sum, bill) =>
        sum +
        (bill.status === "CANCELLED"
          ? 0
          : Number(bill.outstandingAmount || 0)),
      0
    );

    return {
      recordedAmount,
      outstandingAmount,
      paymentCount: currentPayments.length,
      pendingBills: payableBills.length,
    };
  }, [payments, bills, payableBills, wholesalerId]);

  function openModal() {
    setForm({
      ...INITIAL_FORM,
      paymentDate: todayLocal(),
      idempotencyKey: crypto.randomUUID(),
    });

    setFormError("");
    setNotice("");
    setShowModal(true);
  }

  function closeModal() {
    if (busy) return;
    setShowModal(false);
    setFormError("");
  }

  function updateField(field, value) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
      // New data means a new payment request.
      idempotencyKey: crypto.randomUUID(),
    }));
    setFormError("");
  }

  async function submitPayment(event) {
    event.preventDefault();

    if (busy) return;

    setFormError("");

    const amount = Number(form.amount);
    const outstanding = Number(
      selectedBill?.outstandingAmount || 0
    );

    if (!selectedBill || outstanding <= 0) {
      setFormError("Please select an invoice with an outstanding balance.");
      return;
    }

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !/^\d{1,10}(\.\d{1,2})?$/.test(form.amount)
    ) {
      setFormError("Enter a valid payment amount.");
      return;
    }

    if (Math.round(amount * 100) > Math.round(outstanding * 100)) {
      setFormError(
        `Payment cannot exceed ${money(outstanding)}.`
      );
      return;
    }

    setBusy(true);

    try {
      const result = await shopOwnerApi.recordWholesalePayment({
        billId: form.billId,
        amount: amount.toFixed(2),
        method: form.method,
        paymentDate: form.paymentDate,
        transactionReference:
          form.transactionReference.trim(),
        notes: form.notes.trim(),
        idempotencyKey: form.idempotencyKey,
      });

      setShowModal(false);
      setForm(INITIAL_FORM);

      setNotice(
        result.alreadyRecorded
          ? "This payment was already recorded."
          : "Wholesaler payment recorded successfully."
      );

      await reload();
    } catch (requestError) {
      setFormError(
        requestError.message || "Unable to record payment."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <h5 className="fw-bold mb-1">Payment History</h5>
          <p className="text-muted small mb-0">
            Track wholesaler payments and outstanding invoices.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={openModal}
        >
          + Record Payment
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
          {
            title: "Payment Records",
            value: summary.paymentCount,
          },
          {
            title: "Recorded Payments",
            value: money(summary.recordedAmount),
          },
          {
            title: "Outstanding Balance",
            value: money(summary.outstandingAmount),
          },
          {
            title: "Pending Bills",
            value: summary.pendingBills,
          },
        ].map((item) => (
          <div className="col-12 col-sm-6 col-xl-3" key={item.title}>
            <div className="card border h-100">
              <div className="card-body">
                <div className="small text-muted mb-2">
                  {item.title}
                </div>
                <h5 className="fw-bold mb-0">
                  {loading ? "-" : item.value}
                </h5>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="d-flex flex-wrap gap-3 mb-3">
        <input
          type="search"
          className="form-control"
          style={{ maxWidth: 330 }}
          placeholder="Search invoice, wholesaler or reference..."
          aria-label="Search payment history"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select
          className="form-select"
          style={{ maxWidth: 210 }}
          value={methodFilter}
          onChange={(event) =>
            setMethodFilter(event.target.value)
          }
          aria-label="Filter payment method"
        >
          <option value="ALL">All Payment Methods</option>
          {Object.entries(METHODS).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={reload}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="workspace-state">
          Loading payment history...
        </div>
      ) : filteredPayments.length === 0 ? (
        <div className="empty-state text-center py-5">
          {search || methodFilter !== "ALL"
            ? "No matching payments found."
            : "No wholesaler payments recorded yet."}
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover align-middle workspace-table">
            <thead className="table-light">
              <tr>
                <th>Details</th>
                 <th>Payment Date</th>
                <th>Wholesaler</th>
                <th>Invoice</th>
                <th>Method</th>
                <th>Transaction Reference</th>
                <th className="text-end">Amount</th>
              </tr>
            </thead>

            <tbody>
              {filteredPayments.map((payment) => (
                <tr key={payment.id}><td><button type="button" className="btn btn-sm btn-outline-primary" onClick={()=>setSelectedPayment(payment)}>View</button></td>
                  <td>{displayDate(payment.paymentDate)}</td>

                  <td>
                    <div className="fw-medium">
                      {payment.wholesaler?.name ||
                        payment.bill?.wholesaler?.name ||
                        "-"}
                    </div>
                    <small className="text-muted">
                      {payment.wholesaler?.code ||
                        payment.bill?.wholesaler?.code ||
                        ""}
                    </small>
                  </td>

                  <td>
                    {payment.invoiceNumber ||
                      payment.bill?.invoiceNumber ||
                      "-"}
                  </td>

                  <td>
                    <span
                      className={`badge ${paymentBadge(payment.method)}`}
                    >
                      {METHODS[payment.method] || payment.method}
                    </span>
                  </td>

                  <td>
                    {payment.transactionReference || "-"}
                  </td>

                  <td className="text-end fw-semibold">
                    {money(payment.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payments.length >= 200 && (
        <p className="small text-muted mt-2">
          Showing the latest 200 payment records.
        </p>
      )}

      {selectedPayment && <WholesaleRecordDetails title={`Payment — ${selectedPayment.id.slice(0,8)}`} rows={[["Wholesaler",selectedPayment.wholesaler?.name||selectedPayment.bill?.wholesaler?.name],["Invoice",selectedPayment.invoiceNumber||selectedPayment.bill?.invoiceNumber],["Date",String(selectedPayment.paymentDate||"").slice(0,10)],["Amount",money(selectedPayment.amount)],["Method",selectedPayment.method],["Reference",selectedPayment.transactionReference]]} notes={selectedPayment.notes} onSave={async notes=>{await shopOwnerApi.updatePaymentNotes(selectedPayment.id,{notes});await reload();}} onClose={()=>setSelectedPayment(null)}/>}
       {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1055,
            background: "rgba(15, 23, 42, 0.65)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            className="card shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-payment-title"
            style={{
              width: "min(680px, 100%)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div className="card-header bg-white d-flex align-items-center justify-content-between py-3">
              <div>
                <h5
                  className="fw-bold mb-1"
                  id="record-payment-title"
                >
                  Record Wholesaler Payment
                </h5>
                <p className="small text-muted mb-0">
                  Record a payment already made to a wholesaler.
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

            <form onSubmit={submitPayment}>
              <div className="card-body">
                {formError && (
                  <div className="alert alert-danger" role="alert">
                    {formError}
                  </div>
                )}

                <div className="mb-3">
                  <label
                    htmlFor="payment-bill"
                    className="form-label fw-semibold"
                  >
                    Select Invoice *
                  </label>

                  <select
                    id="payment-bill"
                    className="form-select"
                    required
                    value={form.billId}
                    onChange={(event) =>
                      updateField("billId", event.target.value)
                    }
                  >
                    <option value="">
                      Select outstanding invoice
                    </option>

                    {payableBills.map((bill) => (
                      <option key={bill.id} value={bill.id}>
                        {bill.invoiceNumber} —{" "}
                        {bill.wholesaler?.name || "Wholesaler"} —{" "}
                        {money(bill.outstandingAmount)} due
                      </option>
                    ))}
                  </select>

                  {payableBills.length === 0 && (
                    <div className="form-text">
                      No unpaid invoices available. Upload a bill
                      first.
                    </div>
                  )}
                </div>

                {selectedBill && (
                  <div className="border rounded p-3 mb-3 bg-light">
                    <div className="row g-2">
                      <div className="col-sm-4">
                        <small className="text-muted d-block">
                          Invoice Amount
                        </small>
                        <strong>
                          {money(selectedBill.amount)}
                        </strong>
                      </div>

                      <div className="col-sm-4">
                        <small className="text-muted d-block">
                          Already Paid
                        </small>
                        <strong>
                          {money(selectedBill.paidAmount)}
                        </strong>
                      </div>

                      <div className="col-sm-4">
                        <small className="text-muted d-block">
                          Outstanding
                        </small>
                        <strong className="text-danger">
                          {money(selectedBill.outstandingAmount)}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                <div className="row g-3 mb-3">
                  <div className="col-md-6">
                    <label
                      htmlFor="payment-amount"
                      className="form-label fw-semibold"
                    >
                      Payment Amount *
                    </label>

                    <input
                      id="payment-amount"
                      className="form-control"
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={
                        selectedBill
                          ? selectedBill.outstandingAmount
                          : undefined
                      }
                      required
                      value={form.amount}
                      onChange={(event) =>
                        updateField("amount", event.target.value)
                      }
                      placeholder="0.00"
                    />
                  </div>

                  <div className="col-md-6">
                    <label
                      htmlFor="payment-method"
                      className="form-label fw-semibold"
                    >
                      Payment Method *
                    </label>

                    <select
                      id="payment-method"
                      className="form-select"
                      required
                      value={form.method}
                      onChange={(event) =>
                        updateField("method", event.target.value)
                      }
                    >
                      {Object.entries(METHODS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label
                      htmlFor="payment-date"
                      className="form-label fw-semibold"
                    >
                      Payment Date *
                    </label>

                    <input
                      id="payment-date"
                      className="form-control"
                      type="date"
                      required
                      value={form.paymentDate}
                      onChange={(event) =>
                        updateField("paymentDate", event.target.value)
                      }
                    />
                  </div>

                  <div className="col-md-6">
                    <label
                      htmlFor="payment-reference"
                      className="form-label fw-semibold"
                    >
                      Transaction Reference
                    </label>

                    <input
                      id="payment-reference"
                      className="form-control"
                      maxLength={150}
                      value={form.transactionReference}
                      onChange={(event) =>
                        updateField(
                          "transactionReference",
                          event.target.value
                        )
                      }
                      placeholder="UTR / Cheque / Transaction ID"
                    />
                  </div>
                </div>

                <div className="mb-2">
                  <label
                    htmlFor="payment-notes"
                    className="form-label fw-semibold"
                  >
                    Notes (Optional)
                  </label>

                  <textarea
                    id="payment-notes"
                    className="form-control"
                    rows={3}
                    maxLength={1000}
                    value={form.notes}
                    onChange={(event) =>
                      updateField("notes", event.target.value)
                    }
                    placeholder="Payment details or remarks..."
                  />
                </div>
              </div>

              <div className="card-footer bg-white d-flex justify-content-end gap-2 py-3">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={busy}
                  onClick={closeModal}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={
                    busy ||
                    payableBills.length === 0 ||
                    !form.billId
                  }
                >
                  {busy ? "Saving..." : "Record Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
