import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/caveat/600.css";
import "./styles.css";
import "./motion.css";
import App from "./App";
import Intro from "./Intro";

const which = new URLSearchParams(location.search).get("demo");
const sheets = which === "sheets";
const demo = which !== null && !sheets;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App revisionDemo={demo} sheetDemo={sheets} />
    {which === null && <Intro />}
  </React.StrictMode>,
);
