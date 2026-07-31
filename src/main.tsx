import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./context/themecontext";
import { AuthProvider } from "./context/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import App from "./App";
import "./index.css";

const originalWarn = window.console.warn.bind(window.console);

window.console.warn = (...args: unknown[]) => {
  const first = typeof args[0] === "string" ? args[0] : "";
  if (first.includes("The width(-1) and height(-1) of chart should be greater than 0")) {
    return;
  }
  originalWarn(...args);
};

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

if (import.meta.env.PROD) {
  const api = String(import.meta.env.VITE_MANUAL_API_URL || "").trim();
  if (!api || /localhost|127\.0\.0\.1/.test(api)) {
    console.warn(
      "[Lab Record] Production build has no public API URL. In Vercel → Environment Variables, set VITE_MANUAL_API_URL to your Render Web Service URL (e.g. https://lab-record-system-moy2.onrender.com, no trailing slash), then Redeploy. On Render, set CORS_ORIGINS=https://lab-record-system.vercel.app"
    );
  }
}

ReactDOM.createRoot(root).render(
  <ErrorBoundary>
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  </ErrorBoundary>
);
