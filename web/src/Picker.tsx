import { useMemo, useState } from "react";
import { fileUrl, isImage } from "./api";
import { SOURCE_LABEL, sheetCode, shortName } from "./format";
import type { Drawing } from "./types";

type Props = { drawings: Drawing[]; selected: string; onSelect: (path: string) => void };

export default function Picker({ drawings, selected, onSelect }: Props) {
  const [source, setSource] = useState<string>("swiss_dwellings");
  const sources = useMemo(() => {
    const c = new Map<string, number>();
    drawings.forEach((d) => c.set(d.source, (c.get(d.source) ?? 0) + 1));
    return [...c.entries()];
  }, [drawings]);
  const list = drawings.filter((d) => d.source === source);
  const paths = useMemo(() => drawings.map((d) => d.path), [drawings]);

  return (
    <nav className="panel picker">
      <div className="panel-head">
        <span className="tb-label">Drawings</span>
        <span className="mono">{drawings.length}</span>
      </div>
      <div className="sources">
        {sources.map(([s, n]) => (
          <button key={s} className={`src ${s === source ? "on" : ""}`} onClick={() => setSource(s)}>
            {SOURCE_LABEL[s] ?? s} <span className="mono dim">{n}</span>
          </button>
        ))}
      </div>
      <div className="thumbs">
        {list.map((d) => (
          <button key={d.path} className={`thumb ${d.path === selected ? "on" : ""}`} onClick={() => onSelect(d.path)}>
            {d.view.endsWith(".ifc") ? (
              <div className="thumb-img ifc">IFC</div>
            ) : (
              <img
                className="thumb-img"
                loading="lazy"
                src={fileUrl(d.view, isImage(d.view) ? 0.15 : 0.12)}
                alt={shortName(d.path)}
              />
            )}
            <div className="thumb-cap">
              <span className="mono">{sheetCode(paths, d.path, d.source)}</span>
              <span className="dim">{d.questions.length} Qs</span>
            </div>
          </button>
        ))}
      </div>
    </nav>
  );
}
