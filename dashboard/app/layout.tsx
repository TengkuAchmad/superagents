import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Opencode Agents Monitor",
  description: "Opencode AI Agent Activity Dashboard — Live Monitor",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <div className="layout">
          <header className="header" role="banner" aria-label="Opencode Agents Monitor">
            <div>
              <div className="header-title">Opencode Agents Monitor</div>
              <div className="header-sub">
                Opencode AI Agents — Live Activity Dashboard — agent.db
              </div>
            </div>
          </header>
          <main className="main" role="main">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
