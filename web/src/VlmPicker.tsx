import { useEffect, useState } from "react";
import "./vlm.css";

type Backend = { name: string; ready: boolean; needs: string[]; model: string | null };
type Vlm = {
  backend: string | null;
  current: string | null;
  latest: string | null;
  available: string[];
  models?: string[];
  backends?: Backend[];
};

const LABEL: Record<string, string> = {
  gemini: "Gemini",
  "gemma-api": "Gemma 4 (API)",
  gemma: "Gemma (local GPU)",
  nemotron: "Nemotron (NVIDIA)",
  "nemotron-verda": "Nemotron (Verda)",
  vllm: "vLLM server",
};

// Composer model picker (chat-app convention): swaps the last-resort VLM on the running server, no restart.
export default function VlmPicker() {
  const [v, setV] = useState<Vlm | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/vlm").then((r) => (r.ok ? r.json() : null)).then(setV).catch(() => setV(null));
  }, []);

  if (!v) return null;

  const post = async (body: { backend?: string; model?: string }, key: string) => {
    setBusy(key);
    setErr("");
    try {
      const r = await fetch("/api/vlm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).detail ?? r.status);
      setV(await r.json());
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy("");
    }
  };

  const backends = v.backends ?? [];
  const models = v.models?.length ? v.models : v.available;
  const off = !v.backend;
  const title = off
    ? "VLM off: questions no exact reader answers stay unanswered. Pick a model to turn it on."
    : `Last-resort reader (${v.backend}). Only used when no cheaper method answers. Switching applies to this server until restart.`;

  return (
    <details
      className="vlm-pick"
      onKeyDown={(e) => e.key === "Escape" && (e.currentTarget.open = false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.open = false;
      }}
    >
      <summary className={`vlm${v.latest ? " new" : ""}${off ? " off" : ""}`} title={title}>
        {v.latest && <span className="dot" />}
        <span className="k">Fallback</span>
        <span className="mono ellipsis">{off ? "off" : v.current ?? v.backend}</span>
        <span className="caret">▾</span>
      </summary>
      <div className="vlm-list">
        {v.latest && (
          <button className="upd" onClick={() => post({ model: v.latest! }, "latest")} disabled={!!busy}>
            <span>New model available</span>
            <span className="mono">{busy === "latest" ? "switching…" : `Update to ${v.latest}`}</span>
          </button>
        )}

        <div className="sgroup">Backend</div>
        {backends.map((b) => (
          <button
            key={b.name}
            className={b.name === v.backend ? "on" : ""}
            disabled={!b.ready || !!busy}
            onClick={() => b.name !== v.backend && post({ backend: b.name }, b.name)}
            title={b.ready ? undefined : `Needs ${b.needs.join(" or ")} in .env`}
          >
            <span className="vrow">
              <span>{LABEL[b.name] ?? b.name}</span>
              {b.name === v.backend && <span className="tick">✓</span>}
              {busy === b.name && <span className="dim small">switching…</span>}
            </span>
            <span className="dim small mono ellipsis">
              {b.ready ? b.model ?? "model from server" : `needs ${b.needs.join(" or ")}`}
            </span>
          </button>
        ))}
        <button className={off ? "on" : ""} disabled={!!busy} onClick={() => !off && post({ backend: "" }, "off")}>
          <span className="vrow">
            <span>Off</span>
            {off && <span className="tick">✓</span>}
          </span>
          <span className="dim small">exact readers only, €0</span>
        </button>

        {models.length > 0 && (
          <>
            <div className="sgroup">Model</div>
            <select
              className="mono"
              value={v.current ?? ""}
              disabled={!!busy}
              onChange={(e) => post({ model: e.target.value }, "model")}
            >
              {v.current && !models.includes(v.current) && <option value={v.current}>{v.current}</option>}
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                  {m === v.latest ? " (newest)" : ""}
                </option>
              ))}
            </select>
          </>
        )}

        {err && <div className="err small">{err}</div>}
        <div className="foot dim small">Applies to this server until restart. Keep it: set SITELENS_VLM in .env.</div>
      </div>
    </details>
  );
}
