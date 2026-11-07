import React from "react";

export default class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("E-Shop encountered a rendering error.", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="portal-shell error-fallback" role="alert">
        <section className="workspace-card">
          <h1>We could not load this page</h1>
          <p>Try again. Your account and saved data have not been changed by this display error.</p>
          {this.state.error?.message && <p className="store-alert">{this.state.error.message}</p>}
          <button className="btn btn-primary" type="button" onClick={() => this.setState({ hasError: false, error: null })}>Try again</button>
        </section>
      </main>
    );
  }
}
