import React from "react";
import ReactDOM from "react-dom/client";
import AppRouter from "./AppRouter";
import { LangProvider } from "./i18n";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LangProvider>
      <AppRouter />
    </LangProvider>
  </React.StrictMode>
);
