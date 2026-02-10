import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Assembly — Client Portal Preview",
  description: "Create a customized white-labeled client portal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
