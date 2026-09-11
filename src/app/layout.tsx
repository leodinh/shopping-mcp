import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";
import { Header } from "./_components/header";
import { Footer } from "./_components/footer";

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sora",
});

export const metadata: Metadata = {
  title: "Shopping with Agent",
  description: "Connect your store to AI assistants, or connect your assistant to start shopping.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={sora.variable}>
      <body className="m-0 bg-accent font-sans text-base text-muted">
        <div className="mx-auto flex min-h-dvh max-w-500 flex-col bg-paper">
          <Header />
          {children}
          <Footer />
        </div>
      </body>
    </html>
  );
}
