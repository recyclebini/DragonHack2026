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
          <div className="glass rounded-full px-4 h-11 flex items-center justify-between sm:px-5">
            <Link
              to="/"
              className="flex shrink-0 items-center gap-2.5 py-0.5"
              aria-label="Seenesthesia home"
            >
              <img
                src="/favicon.png"
                alt=""
                width={32}
                height={32}
                className="size-8 shrink-0 rounded-lg object-cover ring-1 ring-border/60"
                decoding="async"
              />
              <span className="font-serif text-lg font-normal not-italic tracking-tight text-[oklch(0.84_0.02_280)]">
                seenesthesia
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
