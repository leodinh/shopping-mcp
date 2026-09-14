import type { Metadata } from "next";
import { Atkinson_Hyperlegible } from "next/font/google";
import "./globals.css";
import { Header } from "./_components/header";
import { Footer } from "./_components/footer";

const talk = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-talk",
});

export const metadata: Metadata = {
  title: "Shopping with Agent",
  description: "Add Shopping MCP to your AI assistant, then ask it to search and compare products.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={talk.variable} data-scroll-behavior="smooth">
      <body className="m-0 bg-accent font-sans text-base text-muted">
        <div className="mx-auto flex h-dvh max-w-3xl flex-col overflow-x-hidden bg-paper shadow-[inset_0_0_120px_40px_rgb(61_107_79_/_0.14)]">
          <Header />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
          <Footer />
        </div>
      </body>
    </html>
  );
}
