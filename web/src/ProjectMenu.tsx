import { KIND_LABEL, type Proj, type Recent } from "./workspace";

type Props = {
  project: Proj;
  projects: Proj[];
  recent: Recent;
  onOpen: (key: string) => void;
  onHome: () => void;
};

// Breadcrumb project switcher (Figma / ACC style): recent projects one click away, the full list on Home.
export default function ProjectMenu({ project, projects, recent, onOpen, onHome }: Props) {
  const others = projects
    .filter((p) => p.key !== project.key && recent[p.key])
    .sort((a, b) => recent[b.key].t - recent[a.key].t)
    .slice(0, 6);
  const close = (el: HTMLElement) => {
    const d = el.closest("details");
    if (d) d.open = false;
  };
  return (
    <details
      className="pmenu"
      onKeyDown={(e) => e.key === "Escape" && (e.currentTarget.open = false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.open = false;
      }}
    >
      <summary className="crumb proj" title="Switch project">
        <span className="ellipsis">{project.name}</span>
        <span className="caret">▾</span>
      </summary>
      <div className="pmenu-list">
        <div className="pmenu-cur">
          <span className="pname ellipsis">{project.name}</span>
          <span className="dim small ellipsis">{KIND_LABEL[project.kind]} · {project.org}</span>
        </div>
        {others.length > 0 && <div className="sgroup">Recent</div>}
        {others.map((p) => (
          <button key={p.key} onClick={(e) => (close(e.currentTarget), onOpen(p.key))}>
            <span className="ellipsis">{p.name}</span>
            <span className="dim small">{KIND_LABEL[p.kind]}</span>
          </button>
        ))}
        <button className="all" onClick={(e) => (close(e.currentTarget), onHome())}>All projects…</button>
      </div>
    </details>
  );
}
