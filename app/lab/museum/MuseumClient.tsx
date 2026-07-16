"use client";

import dynamic from "next/dynamic";

const Museum3D = dynamic(() => import("./Museum3D"), {
  ssr: false,
  loading: () => (
    <main className="container">
      <p className="status">Loading the museum…</p>
    </main>
  ),
});

export default function MuseumClient({
  handle,
  isOwner = false,
}: {
  handle?: string;
  isOwner?: boolean;
}) {
  return <Museum3D handle={handle} isOwner={isOwner} />;
}
