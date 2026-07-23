// /library — the PUBLIC face of the Library. Anyone (signed in or not) can
// search, browse, and read public-domain books here. Signed-in users get sent
// to /den, their full personal study (saved shelf, folders, writing).
//
// This page is a cached STATIC page: the "signed-in → /den" redirect runs
// client-side (see PublicLibrary). Doing the auth check on the server would
// read cookies and force a fresh render on every visit — wasteful, since the
// public shell is identical for everyone and most traffic is signed-out.

import PublicLibrary from "./PublicLibrary";

export const metadata = {
  title: "Library",
  description:
    "Read and discover public-domain books free — search by title or author, browse by subject, and read classics in a calm, distraction-free reader.",
  alternates: { canonical: "/library" },
};

export default function LibraryPage() {
  return <PublicLibrary />;
}
