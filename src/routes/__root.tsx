import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Seenesthesia" },
      {
        name: "description",
        content: "Seenesthesia transforms your voice into a dynamic, real-time color experience.",
      },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Seenesthesia" },
      {
        property: "og:description",
        content: "Seenesthesia transforms your voice into a dynamic, real-time color experience.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Chromavoice" },
      {
        name: "twitter:description",
        content:
          "Voice Painter Studio transforms your voice into a dynamic, real-time color experience.",
      },
      { name: "theme-color", content: "#0d0d0d" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Chromavoice" },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/cd0ff467-769c-4b84-90ba-6200fd684211/id-preview-c62dc5fc--fa2f81d3-3dbc-4038-8187-17785b6f0a4a.lovable.app-1776511055743.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/cd0ff467-769c-4b84-90ba-6200fd684211/id-preview-c62dc5fc--fa2f81d3-3dbc-4038-8187-17785b6f0a4a.lovable.app-1776511055743.png",
      },
    ],
    links: [
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "stylesheet", href: appCss },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=DM+Sans:wght@300;400;500;600&family=Instrument+Serif&display=swap",
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.svg" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (import.meta.env.DEV) {
      // Avoid stale bundles in development: clear any previously installed PWA worker/cache.
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});

      if ("caches" in window) {
        caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys.filter((k) => k.startsWith("chromavoice-")).map((k) => caches.delete(k)),
            ),
          )
          .catch(() => {});
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return (
    <>
      <Outlet />
      <Toaster position="top-center" theme="dark" />
    </>
  );
}
