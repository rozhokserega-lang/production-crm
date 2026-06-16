import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppProviders } from "./components/AppProviders";
import { reportUiError } from "./services/errorReporter";
import "./styles.css";

// Глобальный перехват ошибок, не пойманных React ErrorBoundary:
// синхронные window errors и необработанные promise rejections (сеть, таймеры, RPC).
// Репортёр сам глушит дубли и спам; индекс фазы загрузки (index.html) не трогаем.
window.addEventListener("error", (event) => {
  const err = event?.error;
  reportUiError({
    type: "window_error",
    message: err?.message || event?.message || "window error",
    stack: err?.stack,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event?.reason;
  reportUiError({
    type: "unhandled_rejection",
    message: reason?.message || String(reason || "unhandled rejection"),
    stack: reason?.stack,
  });
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </React.StrictMode>
);
