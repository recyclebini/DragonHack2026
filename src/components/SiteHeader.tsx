import { Link } from "@tanstack/react-router";

const links = [
  { to: "/", label: "Record" },
  { to: "/map", label: "Voice Map" },
  { to: "/lyrics", label: "Lyrics" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50">
      <div className="mx-auto max-w-6xl px-5 py-4">
        <div className="glass rounded-full px-5 py-3 flex items-center justify-between">
          <Link to="/" className="font-display font-semibold tracking-tight text-lg">
            <span className="bg-gradient-to-r from-[oklch(0.85_0.15_30)] via-[oklch(0.8_0.18_180)] to-[oklch(0.78_0.18_320)] bg-clip-text text-transparent">
              Chromavoice
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                activeOptions={{ exact: true }}
                className="px-3 py-1.5 rounded-full text-muted-foreground hover:text-foreground transition-colors data-[status=active]:bg-white/10 data-[status=active]:text-foreground"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
