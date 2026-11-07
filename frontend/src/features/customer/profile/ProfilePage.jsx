import { useEffect, useState } from "react";
import { customerApi } from "../../../services/customer/index.js";
import { authService } from "../../../services/authService.js";
import {
  PageHeading,
  SignInPrompt,
} from "../../../components/customer/StorefrontComponents.jsx";

export function ProfilePage({ user, signedIn }) {
  const [form, setForm] = useState({
    name: user?.name || "",
    mobile: user?.mobile || "",
  });
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deletionRequest, setDeletionRequest] = useState(null);
  const [deletionReason, setDeletionReason] = useState("");
  const [confirmDeletion, setConfirmDeletion] = useState(false);
  const [deletionLoading, setDeletionLoading] = useState(true);
  const [deletionBusy, setDeletionBusy] = useState(false);
  useEffect(() => {
    let active = true;
    if (!signedIn) {
      setDeletionLoading(false);
      return () => {
        active = false;
      };
    }
    customerApi
      .deletionRequest()
      .then(({ deletionRequest: result }) => {
        if (active) setDeletionRequest(result);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setDeletionLoading(false);
      });
    return () => {
      active = false;
    };
  }, [signedIn]);
  async function saveProfile(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      const { user: updated } = await authService.updateProfile({
        name: form.name,
        mobile: form.mobile || null,
      });
      setForm({ name: updated.name, mobile: updated.mobile || "" });
      setNotice("Profile updated.");
    } catch (requestError) {
      setError(requestError.message);
    }
  }
  async function changePassword(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      const result = await authService.changePassword(passwords);
      setPasswords({ currentPassword: "", newPassword: "" });
      setNotice(result.message);
    } catch (requestError) {
      setError(requestError.message);
    }
  }
  async function submitDeletionRequest(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setDeletionBusy(true);
    try {
      const { deletionRequest: result } =
        await customerApi.submitDeletionRequest(
          deletionReason.trim() ? { reason: deletionReason.trim() } : {},
        );
      setDeletionRequest(result);
      setConfirmDeletion(false);
      setNotice(
        "Your account deletion request was submitted for administrator review.",
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeletionBusy(false);
    }
  }
  async function cancelDeletionRequest() {
    setError("");
    setNotice("");
    setDeletionBusy(true);
    try {
      const { deletionRequest: result } =
        await customerApi.cancelDeletionRequest();
      setDeletionRequest(result);
      setNotice("Your pending account deletion request was cancelled.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeletionBusy(false);
    }
  }
  if (!signedIn) return <SignInPrompt title="Your account" />;
  return (
    <section className="account-page">
      <PageHeading
        eyebrow="ACCOUNT SETTINGS"
        title="My profile"
        description="Update your contact details and account password."
      />
      {error && (
        <div className="store-alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="store-alert success" role="status">
          {notice}
        </div>
      )}
      <div className="profile-layout">
        <form className="address-form" onSubmit={saveProfile}>
          <h2>Profile details</h2>
          <label>
            Full name
            <input
              required
              minLength="2"
              maxLength="100"
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </label>
          <label>
            Email
            <input value={user?.email || ""} readOnly disabled />
          </label>
          <label>
            Mobile
            <input
              type="tel"
              value={form.mobile}
              onChange={(event) =>
                setForm({ ...form, mobile: event.target.value })
              }
            />
          </label>
          <button className="btn btn-primary">Save profile</button>
        </form>
        <form className="address-form" onSubmit={changePassword}>
          <h2>Change password</h2>
          <label>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={passwords.currentPassword}
              onChange={(event) =>
                setPasswords({
                  ...passwords,
                  currentPassword: event.target.value,
                })
              }
            />
          </label>
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength="12"
              maxLength="128"
              required
              value={passwords.newPassword}
              onChange={(event) =>
                setPasswords({ ...passwords, newPassword: event.target.value })
              }
            />
          </label>
          <small>
            Use at least 12 characters. Other active sessions will be signed
            out.
          </small>
          <button className="btn btn-primary">Update password</button>
        </form>
      </div>
      <section className="address-form account-deletion-panel">
        <h2>Account deletion request</h2>
        <p>
          Request administrator review. This request does not immediately
          deactivate your account or erase data; historical order and audit
          records may need to be retained.
        </p>
        {deletionLoading ? (
          <p role="status">Checking request status…</p>
        ) : deletionRequest?.status === "PENDING" ? (
          <>
            <p role="status">
              Request pending since{" "}
              {new Date(deletionRequest.createdAt).toLocaleString()}.
            </p>
            <button
              className="btn btn-outline-secondary"
              type="button"
              disabled={deletionBusy}
              onClick={cancelDeletionRequest}
            >
              Cancel request
            </button>
          </>
        ) : (
          <>
            {deletionRequest && (
              <p>
                Your last request status:{" "}
                <strong>{deletionRequest.status.replaceAll("_", " ")}</strong>
              </p>
            )}
            <form onSubmit={submitDeletionRequest}>
              <label>
                Reason (optional)
                <textarea
                  maxLength="500"
                  rows="3"
                  value={deletionReason}
                  onChange={(event) => setDeletionReason(event.target.value)}
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  required
                  checked={confirmDeletion}
                  onChange={(event) => setConfirmDeletion(event.target.checked)}
                />{" "}
                I understand this submits a request for review and does not
                immediately delete my account.
              </label>
              <button
                className="btn btn-outline-danger"
                disabled={deletionBusy || deletionLoading}
              >
                {deletionBusy ? "Submitting…" : "Request account deletion"}
              </button>
            </form>
          </>
        )}
      </section>
    </section>
  );
}
