import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Self-hosted so the app renders identically on every machine and does not
// wait on a font CDN at startup. `font-synthesis: none` is set in app.css, so
// every weight and italic the app actually renders must exist as a real file -
// a missing one silently stops bold looking bold.
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/400-italic.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-mono/700.css";
import "@fontsource/ibm-plex-mono/700-italic.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";

import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

