import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LogIn, LogOut, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AuthModal } from "@/components/AuthModal";
import { Button } from "@/components/ui/button";

const links = [
  { to: "/", label: "Record" },
  { to: "/map", label: "Voice Map" },
  { to: "/lyrics", label: "Lyrics" },
] as const;

export function SiteHeader() {
  const { user, loading, signOut } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  return (
    <>
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
              {!loading && (
                user ? (
                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <User className="size-3" />
                      {user.email?.split("@")[0]}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full h-8 px-3 text-xs"
                      onClick={() => signOut()}
                    >
                      <LogOut className="size-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full h-8 px-3 text-xs ml-2 glass"
                    onClick={() => setShowAuth(true)}
                  >
                    <LogIn className="size-3" />
                    Sign in
                  </Button>
                )
              )}
            </nav>
          </div>
        </div>
      </header>
      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
    </>
  );
}
