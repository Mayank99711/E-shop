import React from "react";
import { createRoot } from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "./pages/customer/styles.css";
import "./pages/shopOwner/styles.css";
import "./pages/admin/styles.css";
import "./styles/app.css";
import "./pages/customer/eshop-hybrid.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
