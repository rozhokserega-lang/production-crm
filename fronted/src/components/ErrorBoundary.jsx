import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    try {
      console.error("[CRM] UI crashed", error, info);
    } catch (_) {}
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const message = String(this.state.error?.message || this.state.error || "Unknown error");
    return (
      <div style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 10 }}>Произошла ошибка в интерфейсе</div>
        <div style={{ color: "#b91c1c", fontWeight: 700, marginBottom: 8 }}>{message}</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          Откройте DevTools → Console и пришлите первую красную ошибку (если нужно — я быстро исправлю).
        </div>
      </div>
    );
  }
}

