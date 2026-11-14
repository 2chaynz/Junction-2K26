import { useState } from "react";
import AskTab from "./AskTab";

const TABS = ["Ask", "How it works", "Benchmark"] as const;
type Tab = (typeof TABS)[number];

export default function App() {
  const [tab, setTab] = useState<Tab>("Ask");
  return (
    <div className="app">
      <header className="titlebar">
        <div className="tb-cell brand">
          <span className="logo">SITELENS</span>
          <span className="tagline">Make blueprints talk</span>
        </div>
        <nav className="tabs">
          {TABS.map((t, i) => (
            <button key={t} className={`tb-cell tab ${t === tab ? "on" : ""}`} onClick={() => setTab(t)}>
              <span className="tb-label">{`0${i + 1}`}</span>
              {t}
            </button>
          ))}
        </nav>
        <div className="tb-cell meta">
          <span className="tb-label">Sheet</span> A-01
        </div>
        <div className="tb-cell meta">
          <span className="tb-label">Rev</span> B
        </div>
        <div className="tb-cell meta">
          <span className="tb-label">Challenge</span> Stoa · Junction 2026
        </div>
      </header>
      <main className="main">
        {tab === "Ask" && <AskTab />}
        {tab !== "Ask" && (
          <div className="panel soon">
            <div className="panel-head">
              <span className="tb-label">Sheet</span> {tab}
            </div>
            <p>Coming in step 3.</p>
          </div>
        )}
      </main>
    </div>
  );
}
