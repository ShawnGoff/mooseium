// The login page itself is a client component, so its metadata (title +
// noindex — it's a utility page with no search value) lives in this layout.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
