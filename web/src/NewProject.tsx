import { useEffect, useRef, useState } from "react";
import { createProject, deleteProject, uploadFile } from "./api";

// T93: bring your own drawings. Loose files, a folder or a zip become one project.
export const ACCEPT = [".pdf", ".png", ".jpg", ".jpeg", ".ifc", ".dxf", ".zip"];
const FORMATS = "PDF · PNG · JPG · IFC · DXF · ZIP";

export type Picked = { file: File; rel: string };
type Row = Picked & { state: "ready" | "bad" | "sending" | "done" | "skipped"; note?: string; added?: number };

const ext = (n: string) => (n.match(/\.[^.\\/]+$/)?.[0] ?? "").toLowerCase();
const isJunk = (n: string) => /(^|\/)(\.|__MACOSX\/)/.test(n) || /(^|\/)Thumbs\.db$/i.test(n);
const mb = (b: number) => (b < 1e6 ? `${Math.max(1, Math.round(b / 1e3))} KB` : `${(b / 1e6).toFixed(b < 1e7 ? 1 : 0)} MB`);

/** Files of a drop, folders walked recursively (DataTransferItem.webkitGetAsEntry). */
export async function fromDrop(dt: DataTransfer): Promise<{ files: Picked[]; folder?: string }> {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return { files: [...dt.files].map((file) => ({ file, rel: file.name })) };
  const out: Picked[] = [];
  const walk = async (e: FileSystemEntry): Promise<void> => {
    if (e.isFile) {
      const file = await new Promise<File>((ok, no) => (e as FileSystemFileEntry).file(ok, no));
      out.push({ file, rel: e.fullPath.replace(/^\//, "") });
      return;
    }
    const reader = (e as FileSystemDirectoryEntry).createReader();
    // readEntries returns at most ~100 entries per call: read until empty.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((ok, no) => reader.readEntries(ok, no));
      if (!batch.length) break;
      await Promise.all(batch.map(walk));
    }
  };
  await Promise.all(entries.map(walk));
  const dirs = entries.filter((e) => e.isDirectory);
  return { files: out, folder: entries.length === 1 && dirs.length === 1 ? dirs[0].name : undefined };
}

/** Name to suggest: the folder or zip it came from, else the first sheet's name. */
function suggest(files: Picked[], folder?: string): string {
  if (folder) return folder;
  const top = new Set(files.map((f) => f.rel.split("/")[0]));
  if (top.size === 1 && files[0]?.rel.includes("/")) return [...top][0];
  const zip = files.find((f) => ext(f.file.name) === ".zip");
  const base = (zip ?? files[0])?.file.name.replace(/\.[^.]+$/, "") ?? "";
  return base.replace(/[_-]+/g, " ").trim();
}

function rowsOf(files: Picked[]): Row[] {
  return files
    .filter((f) => !isJunk(f.rel))
    .map((f) => ACCEPT.includes(ext(f.file.name))
      ? { ...f, state: "ready" as const }
      : { ...f, state: "bad" as const, note: `${ext(f.file.name) || "no extension"} isn't a drawing format` })
    .sort((a, b) => Number(a.state === "bad") - Number(b.state === "bad") || a.rel.localeCompare(b.rel, "en", { numeric: true }));
}

type Props = {
  initial?: { files: Picked[]; folder?: string } | null;
  onClose: () => void;
  onCreated: (key: string) => Promise<void> | void;
};

export default function NewProject({ initial, onClose, onCreated }: Props) {
  const [rows, setRows] = useState<Row[]>(() => rowsOf(initial?.files ?? []));
  const [name, setName] = useState(() => (initial ? suggest(initial.files, initial.folder) : ""));
  const [touched, setTouched] = useState(false); // typed a name: later drops don't overwrite it
  const [phase, setPhase] = useState<"pick" | "send" | "done">("pick");
  const [sent, setSent] = useState(0);
  const [err, setErr] = useState("");
  const [over, setOver] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const filesIn = useRef<HTMLInputElement>(null);
  const dirIn = useRef<HTMLInputElement>(null);
  const nameIn = useRef<HTMLInputElement>(null);

  const ready = rows.filter((r) => r.state !== "bad");
  const total = ready.reduce((s, r) => s + r.file.size, 0);
  const busy = phase === "send";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  useEffect(() => nameIn.current?.select(), []);

  function addFiles(files: Picked[], folder?: string) {
    if (!files.length) return;
    setErr("");
    setRows((old) => {
      const seen = new Set(old.map((r) => r.rel + r.file.size));
      return rowsOf([...old, ...files.filter((f) => !seen.has(f.rel + f.file.size))]);
    });
    if (!touched && !name) setName(suggest(files, folder));
  }

  const fromInput = (list: FileList | null) => {
    const files = [...(list ?? [])].map((file) => ({ file, rel: file.webkitRelativePath || file.name }));
    addFiles(files);
  };

  async function create() {
    if (!ready.length) return setErr("Add at least one drawing.");
    setPhase("send");
    setErr("");
    let id = "";
    try {
      const p = await createProject(name.trim() || "Untitled project");
      id = p.id;
      let base = 0, added = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.state === "bad") continue;
        setRows((rs) => rs.map((x, j) => (j === i ? { ...x, state: "sending" } : x)));
        const res = await uploadFile(id, r.file.name, r.file, (n) => setSent(base + n));
        base += r.file.size;
        setSent(base);
        added += res.added.length;
        const note = res.skipped.length
          ? res.added.length ? `${res.added.length} added · ${res.skipped.length} skipped: ${res.skipped.map((s) => `${s.name.split("/").pop()} (${s.reason})`).join(", ")}` : res.skipped[0].reason
          : res.added.length > 1 ? `${res.added.length} drawings` : undefined;
        setRows((rs) => rs.map((x, j) => (j === i ? { ...x, state: res.added.length ? "done" : "skipped", note, added: res.added.length } : x)));
      }
      if (!added) {
        await deleteProject(id).catch(() => {});
        setPhase("pick");
        setRows((rs) => rs.map((r) => (r.state === "skipped" ? { ...r, state: "bad" } : r)));
        return setErr("None of these files could be read as drawings.");
      }
      setKey(p.key);
      setPhase("done");
    } catch (e) {
      if (id) await deleteProject(id).catch(() => {});
      setPhase("pick");
      setRows((rs) => rs.map((r) => (r.state === "bad" ? r : { ...r, state: "ready", note: undefined })));
      setErr(String(e).replace(/^Error: /, ""));
    }
  }

  // Everything landed cleanly: go straight into the project. Skips stay on screen until dismissed.
  const clean = phase === "done" && rows.every((r) => r.state === "done" || r.state === "bad") && !rows.some((r) => r.note?.includes("skipped"));
  useEffect(() => {
    if (clean && key) void onCreated(key);
  }, [clean, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = total ? Math.min(100, (sent / total) * 100) : 0;
  const nAdded = rows.reduce((s, r) => s + (r.added ?? 0), 0);

  return (
    <div className="npback" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="npdlg" role="dialog" aria-modal="true" aria-labelledby="np-title">
        <div className="nphead">
          <h2 id="np-title">New project</h2>
          <button className="npx" onClick={onClose} disabled={busy} aria-label="Close">×</button>
        </div>

        <label className="npname">
          <span className="dim small">Project name</span>
          <input
            ref={nameIn}
            value={name}
            onChange={(e) => (setName(e.target.value), setTouched(true))}
            onKeyDown={(e) => e.key === "Enter" && !busy && phase === "pick" && create()}
            placeholder="e.g. Clinic tower, issue C"
            disabled={phase !== "pick"}
            maxLength={80}
          />
        </label>

        {phase === "pick" && (
          <div
            className={`npdrop ${over ? "over" : ""} ${rows.length ? "slim" : ""}`}
            onDragOver={(e) => (e.preventDefault(), e.stopPropagation(), setOver(true))}
            onDragLeave={() => setOver(false)}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              setOver(false);
              const d = await fromDrop(e.dataTransfer);
              addFiles(d.files, d.folder);
            }}
          >
            <svg viewBox="0 0 24 24" className="npicon" aria-hidden>
              <path d="M12 15V4m0 0-4 4m4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
            </svg>
            <span>
              {rows.length ? "Drop more, or " : "Drop drawings, a folder or a zip here, or "}
              <button className="link" onClick={() => filesIn.current?.click()}>choose files</button>
              {" · "}
              <button className="link" onClick={() => dirIn.current?.click()}>choose a folder</button>
            </span>
            {!rows.length && <span className="mono dim small">{FORMATS}</span>}
            <input ref={filesIn} type="file" multiple hidden accept={ACCEPT.join(",")}
              onChange={(e) => (fromInput(e.target.files), (e.target.value = ""))} />
            <input ref={dirIn} type="file" hidden {...{ webkitdirectory: "", directory: "" }}
              onChange={(e) => (fromInput(e.target.files), (e.target.value = ""))} />
          </div>
        )}

        {rows.length > 0 && (
          <ul className="npfiles">
            {rows.map((r, i) => (
              <li key={r.rel + i} className={r.state}>
                <span className="npst" aria-hidden>
                  {r.state === "done" ? "✓" : r.state === "sending" ? <span className="npspin" /> : r.state === "bad" || r.state === "skipped" ? "–" : ""}
                </span>
                <span className="npfn ellipsis" title={r.rel}>{r.rel}</span>
                <span className="npnote small ellipsis" title={r.note}>{r.note ?? mb(r.file.size)}</span>
                {phase === "pick" && (
                  <button className="npx sm" aria-label={`Remove ${r.rel}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>×</button>
                )}
              </li>
            ))}
          </ul>
        )}

        {busy && <div className="npbar" aria-label="Upload progress"><span style={{ width: `${pct}%` }} /></div>}
        {err && <p className="nperr" role="alert">{err}</p>}

        <div className="npfoot">
          <span className="dim small">
            {phase === "done" ? `${nAdded} drawing${nAdded === 1 ? "" : "s"} imported`
              : busy ? `Uploading ${mb(sent)} of ${mb(total)}`
              : ready.length ? `${ready.length} file${ready.length === 1 ? "" : "s"} · ${mb(total)}`
              : "Files stay on this server."}
          </span>
          <span className="spacer" />
          {phase === "done" ? (
            <button className="btn primary" onClick={() => key && onCreated(key)}>Open project</button>
          ) : (
            <>
              <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="btn primary" onClick={create} disabled={busy || !ready.length}>
                {busy ? "Importing…" : "Create project"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
