// /lab/museum?u=<handle> — isolated 3D museum lobby. Not linked in nav; noindex.

import MuseumClient from "./MuseumClient";

export const metadata = {
  title: "3D museum (lab)",
  robots: { index: false, follow: false },
};

export default function LabMuseumPage() {
  return <MuseumClient />;
}
