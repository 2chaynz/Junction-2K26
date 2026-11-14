import type { Maker } from "./benchData";

// Makers' own marks (web/public/logos); the maker's name is always written next to it.
const LOGO: Partial<Record<Maker, string>> = {
  google: "gemini.png",
  nvidia: "nvidia.png",
  anthropic: "anthropic.png",
  openai: "openai.svg",
};

export default function ModelLogo({ maker, size = 22 }: { maker: Maker; size?: number }) {
  const s = { width: size, height: size, flex: "none" } as const;
  const file = LOGO[maker];
  if (file) return <img src={`/logos/${file}`} alt="" style={{ ...s, objectFit: "contain" }} />;
  return (
    <svg viewBox="0 0 24 24" style={s} aria-hidden>
      <rect width="24" height="24" rx="4" fill="#fff" stroke="var(--red)" />
      <path d="M5 13 C4 7 13 3.5 18 7 C22 10 19 18.5 12 19 C7 19.4 5.5 16 6.5 13.5" fill="none"
        stroke="var(--red)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
