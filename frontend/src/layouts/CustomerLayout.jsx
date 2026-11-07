export default function CustomerLayout({ apiState, children }) {
  return <main className="portal-shell customer-marketplace" data-api-state={apiState}>{children}</main>;
}
