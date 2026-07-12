"use client";

// Client wrapper: dynamically imports the 3D scene with SSR disabled so three.js
// is code-split into its own chunk and never loads on any other page.

import dynamic from "next/dynamic";

const Room3D = dynamic(() => import("./Room3D"), {
  ssr: false,
  loading: () => (
    <main className="container">
      <p className="status">Loading the room…</p>
    </main>
  ),
});

export default function RoomClient() {
  return <Room3D />;
}
