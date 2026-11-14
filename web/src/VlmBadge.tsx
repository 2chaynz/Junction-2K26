import { useEffect, useState } from "react";
import "./vlm.css";

type Vlm = { backend: string | null; current: string | null; latest: string | null; available: string[] };

// Top-bar chip naming the last-resort VLM; turns into an update button when a newer model of its family exists.
export default function VlmBadge() {
  const [v, setV] = useState<Vlm | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/vlm").then((r) => (r.ok ? r.json() : null)).then(setV).catch(() => setV(null));
  }, []);

  if (!v?.backend) return null;

  const update = async () => {
    if (!v.latest) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/vlm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: v.latest }),
      });
      if (!r.ok) throw new Error((await r.json()).detail ?? r.status);
      setV(await r.json());
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const title = `Last-resort reader (${v.backend}). Only used when no cheaper method answers.`;
  if (!v.latest)
    return (
      <span className="vlm" title={title}>
        <span className="k">VLM</span>
        <span className="mono">{v.current}</span>
      </span>
    );
  return (
    <button className="vlm new" onClick={update} disabled={busy} title={err || `${title} Switches this server now; run python -m sitelens.vlm_backends --upgrade to keep it.`}>
      <span className="dot" />
      <span>New VLM</span>
      <span className="mono">{v.latest}</span>
      <span className="go">{busy ? "switching…" : err ? "failed, retry" : "Update"}</span>
    </button>
  );
}
