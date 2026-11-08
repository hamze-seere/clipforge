import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClipForge: AI video generator",
  description: "Turn a sentence or a photo into a video clip with the best AI video models.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <Link href="/" className="logo">
            <span className="logo-mark">▶</span> ClipForge
          </Link>
          <div className="nav-links">
            <Link href="/#features" className="hide-sm">Features</Link>
            <Link href="/#pricing" className="hide-sm">Pricing</Link>
            {user ? (
              <div className="nav-user">
                <Link href="/billing" className="nav-credits" title="Credits and billing">{user.credits} cr</Link>
                <span className="hide-sm" title={user.email}>{user.email.split("@")[0]}</span>
                <form action="/api/auth/logout" method="post">
                  <button className="btn btn-sm">Log out</button>
                </form>
                <Link href="/studio" className="btn btn-primary btn-sm">Studio</Link>
              </div>
            ) : (
              <>
                <Link href="/login">Log in</Link>
                <Link href="/login?mode=signup" className="btn btn-primary btn-sm">Start free</Link>
              </>
            )}
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
