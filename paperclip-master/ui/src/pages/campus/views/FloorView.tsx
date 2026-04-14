import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Edges, OrbitControls, Text, useCursor } from "@react-three/drei";
import { useNavigate, useParams } from "@/lib/router";
import { ContainerView } from "../components/ContainerView";
import { palette } from "../palette";

interface StubRoom {
  id: string;
  name: string;
  position: [number, number, number];
}

const STUB_ROOMS: StubRoom[] = [
  { id: "room-backend", name: "Backend", position: [-3.5, 0, 0] },
  { id: "room-frontend", name: "Frontend", position: [0, 0, 0] },
  { id: "room-platform", name: "Platform", position: [3.5, 0, 0] },
];

function RoomPlaceholder({
  room,
  onClick,
}: {
  room: StubRoom;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const [x, y, z] = room.position;
  const lift = hovered ? 0.15 : 0;

  return (
    <group
      position={[x, y + lift, z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {/* Small room-shaped box shell */}
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[2.6, 1.0, 2.6]} />
        <meshLambertMaterial color={palette.bone} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      {/* Roof accent */}
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[2.8, 0.2, 2.8]} />
        <meshLambertMaterial color={palette.terracotta} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      <Text
        position={[0, 1.15, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.25}
        color={palette.ink}
        anchorX="center"
        anchorY="middle"
      >
        {room.name}
      </Text>
    </group>
  );
}

/**
 * FloorView — a floor slab with 2–3 room placeholders in a grid.
 * Click → RoomView for that room id.
 */
export function FloorView() {
  const navigate = useNavigate();
  const { companyId, id } = useParams<{ companyId: string; id: string }>();
  const floorName = id ?? "Engineering";

  return (
    <div className="h-[calc(100vh-0px)] w-full">
      <Canvas camera={{ position: [9, 8, 11], fov: 45 }} shadows={false} dpr={[1, 2]}>
        <color attach="background" args={[palette.sky]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 3]} intensity={0.6} />

        <ContainerView layer="floor" name={floorName}>
          {STUB_ROOMS.map((room) => (
            <RoomPlaceholder
              key={room.id}
              room={room}
              onClick={() => navigate(`/campus/${companyId}/room/${room.id}`)}
            />
          ))}
        </ContainerView>

        <OrbitControls
          enablePan={false}
          minDistance={6}
          maxDistance={24}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.2}
          target={[0, 0, 0]}
        />
      </Canvas>
    </div>
  );
}
