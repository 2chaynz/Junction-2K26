import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/caveat/600.css";
import "./styles.css";
import App from "./App";

const FinalDemo = React.lazy(() => import("./FinalDemo"));
const demo = new URLSearchParams(location.search).has("demo");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {demo ? <React.Suspense fallback={null}><FinalDemo /></React.Suspense> : <App />}
  </React.StrictMode>,
);
