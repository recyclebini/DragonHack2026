import { Link } from "@tanstack/react-router";
import { Mic, Map, MessageSquare, Eye, Music, Clapperboard } from "lucide-react";

const links = [
  { to: "/", label: "Scan a Voice", mobileLabel: "Scan", icon: Mic },
  { to: "/map", label: "My People", mobileLabel: "People", icon: Map },
  { to: "/conversation", label: "Conversation", mobileLabel: "Chat", icon: MessageSquare },
  { to: "/visualize", label: "Experience", mobileLabel: "Live", icon: Eye },
  { to: "/music", label: "Music", mobileLabel: "Music", icon: Music },
  { to: "/film", label: "Film", mobileLabel: "Film", icon: Clapperboard },
] as const;

export function SiteHeader() {
  return (
    <>
      {/* ── desktop / tablet top bar ── */}
      <header className="sticky top-0 z-50">
        <div className="mx-auto max-w-6xl px-5 py-4">
          <div className="glass rounded-full px-5 py-3 flex items-center justify-between">
            <Link to="/" className="font-display font-semibold tracking-tight text-lg">
              <span className="bg-gradient-to-r from-[oklch(0.85_0.15_30)] via-[oklch(0.8_0.18_180)] to-[oklch(0.78_0.18_320)] bg-clip-text text-transparent">
                Chromavoice
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-1 text-sm">
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

      {/* ── mobile bottom tab bar ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 pb-safe">
        <div className="mx-4 mb-4">
          <div className="glass rounded-2xl px-1 py-2 flex items-center justify-around">
            {links.map((l) => {
              const Icon = l.icon;
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  activeOptions={{ exact: true }}
                  className="flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl text-muted-foreground transition-colors data-[status=active]:bg-white/10 data-[status=active]:text-foreground"
                >
                  <Icon className="size-5" />
                  <span className="text-[9px] font-medium">{l.mobileLabel}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
