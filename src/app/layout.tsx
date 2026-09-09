import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shopping MCP · Commerce Core",
  description: "A local, cross-merchant catalog. Milestone 1 of Shopping MCP.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
