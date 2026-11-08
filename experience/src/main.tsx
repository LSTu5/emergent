import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
class WorkspaceBoundary extends React.Component<
  React.PropsWithChildren,
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <main role="alert" style={{ padding: 32, display: "block" }}>
        <h1>The workspace needs to reload</h1>
        <p>
          Your server-side simulation continues independently. Reload, then open
          it from Saved runs.
        </p>
        <pre>{this.state.error}</pre>
        <button onClick={() => window.location.reload()}>
          Reload workspace
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <WorkspaceBoundary>
    <App />
  </WorkspaceBoundary>,
);
