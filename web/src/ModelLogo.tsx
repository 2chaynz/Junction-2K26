import type { Maker } from "./benchData";

// Recognisable marks per maker (NVIDIA: official eye mark); the maker's name is always written next to it.
export default function ModelLogo({ maker, size = 22 }: { maker: Maker; size?: number }) {
  const s = { width: size, height: size, flex: "none" } as const;
  switch (maker) {
    case "google":
      return (
        <svg viewBox="0 0 24 24" style={s} aria-hidden>
          <defs>
            <linearGradient id="gm" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#1C7DFF" />
              <stop offset="0.55" stopColor="#8E6CD8" />
              <stop offset="1" stopColor="#E9677B" />
            </linearGradient>
          </defs>
          <path d="M12 1 Q12.6 11.4 23 12 Q12.6 12.6 12 23 Q11.4 12.6 1 12 Q11.4 11.4 12 1Z" fill="url(#gm)" />
        </svg>
      );
    case "nvidia":
      return <img src="/logos/nvidia.png" alt="" style={{ ...s, objectFit: "contain" }} />;
    case "anthropic":
      return (
        <svg viewBox="0 0 24 24" style={s} aria-hidden>
          <rect width="24" height="24" rx="4" fill="#D97757" />
          <g stroke="#fff" strokeWidth="2" strokeLinecap="round">
            {[0, 30, 60, 90, 120, 150].map((a) => (
              <line key={a} x1="12" y1="5" x2="12" y2="19" transform={`rotate(${a} 12 12)`} />
            ))}
          </g>
        </svg>
      );
    case "openai":
      return (
        <svg viewBox="0 0 24 24" style={s} aria-hidden>
          <rect width="24" height="24" rx="4" fill="#111" />
          <path d="M12 5 L18 8.5 L18 15.5 L12 19 L6 15.5 L6 8.5Z" fill="none" stroke="#fff" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="2" fill="#fff" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" style={s} aria-hidden>
          <rect width="24" height="24" rx="4" fill="#fff" stroke="var(--red)" />
          <path d="M5 13 C4 7 13 3.5 18 7 C22 10 19 18.5 12 19 C7 19.4 5.5 16 6.5 13.5" fill="none"
            stroke="var(--red)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
  }
}
