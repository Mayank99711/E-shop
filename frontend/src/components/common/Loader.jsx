export default function Loader({ children = "Loading..." }) {
  return <div className="workspace-state" role="status">{children}</div>;
}
