import type { ReactNode } from "react";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
