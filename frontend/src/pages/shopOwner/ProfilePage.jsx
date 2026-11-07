import { useState } from 'react';
import { authService } from '../../services/authService.js';
import { resolveMediaUrl } from '../../services/shopOwner/index.js';

export function OwnerProfile({ user, submit }) {
  const [profile, setProfile] = useState({ name: user.name, mobile: user.mobile || "" });
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "" });

  async function saveProfile(event) {
    event.preventDefault();
    const result = await submit(
      () => authService.updateProfile({ name: profile.name, mobile: profile.mobile || null }),
      "Profile updated."
    );
    if (result?.user) setProfile({ name: result.user.name, mobile: result.user.mobile || "" });
  }

  async function changePassword(event) {
    event.preventDefault();
    await submit(async () => {
      const result = await authService.changePassword(passwords);
      setPasswords({ currentPassword: "", newPassword: "" });
      return result;
    }, "Password changed. Other active sessions were signed out.");
  }

  return <div className="workspace-columns">
    <section className="workspace-card">
      <h2>Account details</h2>
      <div className="profile-card-heading"><div className="profile-avatar">{user.profileImageUrl ? <img src={resolveMediaUrl(user.profileImageUrl)} alt="" /> : user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div><div><h3>My Profile</h3><p className="muted-copy">Your account identity and access role.</p></div></div>
      <form className="workspace-form" onSubmit={saveProfile}>
        <label>Full Name<input className="form-control" required minLength="2" maxLength="100" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label>
        <label>Email Address<input className="form-control" value={user.email} disabled readOnly /></label>
        <label>Contact Number<input className="form-control" type="tel" minLength="7" maxLength="20" value={profile.mobile} onChange={(event) => setProfile({ ...profile, mobile: event.target.value })} /></label>
        <label>Role<input className="form-control" value={user.role.replaceAll("_", " ")} disabled readOnly /></label>
        <button className="btn btn-primary">Update Profile</button>
      </form>
    </section>
    <section className="workspace-card">
      <h2>Change password</h2>
      <form className="workspace-form" onSubmit={changePassword}>
        <label>Current password<input className="form-control" type="password" autoComplete="current-password" required value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} /></label>
        <label>New password<input className="form-control" type="password" autoComplete="new-password" minLength="12" maxLength="128" required value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} /></label>
        <button className="btn btn-primary">Update password</button>
      </form>
    </section>
  </div>;
}
