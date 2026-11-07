import { useState } from 'react';
import { authService } from '../../../services/authService.js';
import { Notice } from '../../../components/admin/WorkspaceFeedback.jsx';

export function ProfileManagement({ user }) {
  const [profile, setProfile] = useState({ name: user.name, mobile: user.mobile || "" });
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  async function saveProfile(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const result = await authService.updateProfile({ name: profile.name, mobile: profile.mobile || null });
      setProfile({ name: result.user.name, mobile: result.user.mobile || "" });
      setNotice("Profile updated.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const result = await authService.changePassword(passwords);
      setPasswords({ currentPassword: "", newPassword: "" });
      setNotice(result.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Notice error={error} notice={notice} />
      <section className="workspace-card">
        <div className="profile-card-heading"><div className="profile-avatar">{user.profileImageUrl ? <img src={user.profileImageUrl} alt="" /> : initials}</div><div><h3>Administrator profile</h3><p>Update your own account details. Your role and email are read-only.</p></div></div>
        <form className="workspace-form profile-form" onSubmit={saveProfile}>
          <label>Full Name<input className="form-control" required minLength="2" maxLength="100" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label>
          <label>Email Address<input className="form-control" value={user.email} disabled readOnly /></label>
          <label>Contact Number<input className="form-control" type="tel" minLength="7" maxLength="20" value={profile.mobile} onChange={(event) => setProfile({ ...profile, mobile: event.target.value })} /></label>
          <label>Role<input className="form-control" value={user.role.replaceAll("_", " ")} disabled readOnly /></label>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Updating..." : "Update Profile"}</button>
        </form>
      </section>
      <section className="workspace-card">
        <h3>Change password</h3>
        <p>Changing your password signs out other active sessions for this account.</p>
        <form className="workspace-form profile-form" onSubmit={changePassword}>
          <label>Current password<input type="password" autoComplete="current-password" required value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} /></label>
          <label>New password<input type="password" autoComplete="new-password" minLength="12" maxLength="128" required value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} /></label>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Updating..." : "Change password"}</button>
        </form>
      </section>
    </>
  );
}
