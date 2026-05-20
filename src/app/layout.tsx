import "./globals.css";

import type { ReactNode } from "react";

export const metadata = {
  title: "Latex preview generator",
  description: "Standalone thumbnail generation API service for Latex.",
};

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body className="min-h-screen bg-white text-neutral-900">{children}</body>
    </html>
  );
};

export default RootLayout;
