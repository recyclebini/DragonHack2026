import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LogIn, LogOut, User, Mic, Map, MessageSquare, Eye, Music } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AuthModal } from "@/components/AuthModal";
import { Button } from "@/components/ui/button";

const links = [
  { to: "/", label: "Record", mobileLabel: "Record", icon: Mic },
  { to: "/map", label: "Voice Map", mobileLabel: "Map", icon: Map },
  { to: "/conversation", label: "Conversation", mobileLabel: "Chat", icon: MessageSquare },
  { to: "/visualize", label: "Visualize", mobileLabel: "Visual", icon: Eye },
  { to: "/music", label: "Music", mobileLabel: "Music", icon: Music },
] as const;

export function SiteHeader() {
  const { user, loading, signOut } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

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
              {!loading && (
                user ? (
                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <User className="size-3" />
                      {user.email?.split("@")[0]}
                    </span>
                    <Button variant="ghost" size="sm" className="rounded-full h-8 px-3 text-xs" onClick={() => signOut()}>
                      <LogOut className="size-3" />
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" className="rounded-full h-8 px-3 text-xs ml-2 glass" onClick={() => setShowAuth(true)}>
                    <LogIn className="size-3" />
                    Sign in
                  </Button>
                )
              )}
            </nav>

            {/* mobile: just auth button in top bar */}
            <div className="flex md:hidden items-center gap-2">
              {!loading && (
                user ? (
                  <Button variant="ghost" size="sm" className="rounded-full h-8 px-3 text-xs" onClick={() => signOut()}>
                    <User className="size-3 mr-1" />
                    {user.email?.split("@")[0]}
                    <LogOut className="size-3 ml-1" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" className="rounded-full h-8 px-3 text-xs glass" onClick={() => setShowAuth(true)}>
                    <LogIn className="size-3" />
                    Sign in
                  </Button>
                )
              )}
            </div>
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

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
    </>
  );
}
