import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import App from "./App.tsx";

import { applyTheme } from "./display/themes";
import { DEFAULT_DISPLAY_PREFERENCES } from "@habitat/contracts";
applyTheme(DEFAULT_DISPLAY_PREFERENCES.theme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
