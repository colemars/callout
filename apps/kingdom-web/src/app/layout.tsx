import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Financial Kingdom",
  description: "Rule your realm's treasury.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-amber-50 text-stone-900 antialiased dark:bg-stone-950 dark:text-amber-100">
        {children}
      </body>
    </html>
  );
}
