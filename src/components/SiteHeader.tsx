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
