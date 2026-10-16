import type { ReactNode } from "react";
import "./globals.css";
import { ThemeWatcher } from "@notebook/ui";

export const metadata = {
  title: "Notebench",
  description: "The open-source workbench for your sources.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Mono:ital,wght@0,200..800;1,200..800&family=Atkinson+Hyperlegible+Next:ital,wght@0,200..800;1,200..800&family=Literata:ital,opsz,wght@0,7..72,400..700;1,7..72,400..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeWatcher />
        {children}
      </body>
    </html>
  );
}
