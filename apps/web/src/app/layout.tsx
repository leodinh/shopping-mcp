import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

const talk = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-talk",
});

export const metadata: Metadata = {
  title: "Shopping with Agent",
  description: "Add Shopping MCP to your AI assistant, then ask it to search and compare products.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={talk.variable} data-scroll-behavior="smooth">
      <body className="m-0 bg-paper font-sans text-base text-muted">
        <div className="flex h-dvh flex-col">
          <Header />
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          <Footer />
        </div>
      </body>
    </html>
  );
}
