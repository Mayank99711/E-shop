import { useTheme } from '../../context/ThemeContext.jsx';

export function OwnerSettings() {
  const { theme, toggleTheme } = useTheme();
  return <section className="workspace-card"><h2>Settings</h2><h3>Appearance</h3><p className="muted-copy">Choose a display mode for this browser.</p><button className="btn btn-outline-primary" type="button" onClick={toggleTheme}>Switch to {theme === "dark" ? "light" : "dark"} theme</button><hr /><h3>Account security</h3><p className="muted-copy">Sessions are managed securely by E-Shop. Use My Profile to change your password.</p></section>;
}
