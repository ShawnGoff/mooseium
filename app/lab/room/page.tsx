// /lab/room — isolated 3D demo room. Not linked in the nav; kept out of search
// indexes. Renders a client wrapper that lazy-loads the three.js scene.

import RoomClient from "./RoomClient";

export const metadata = {
  title: "3D room (lab)",
  robots: { index: false, follow: false },
};

export default function LabRoomPage() {
  return <RoomClient />;
}
