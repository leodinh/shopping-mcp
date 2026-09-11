import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shopping MCP · Commerce Core",
  description: "A cross-merchant catalog.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="m-0 bg-paper font-sans text-ink">{children}</body>
    </html>
  );
}
