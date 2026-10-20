import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portfolio assistant",
  description: "A personal portfolio assistant with optional browser tools",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      data-theme="dark"
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
