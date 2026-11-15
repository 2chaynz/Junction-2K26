// Logo B: Tac One "Sindri" with a dotless last i and a red round dot (.wm-dot in styles.css).
export function Wordmark() {
  return (
    <span className="wordmark" role="img" aria-label="Sindri">
      <span aria-hidden>Sindr<span className="wm-dot">ı</span></span>
    </span>
  );
}
