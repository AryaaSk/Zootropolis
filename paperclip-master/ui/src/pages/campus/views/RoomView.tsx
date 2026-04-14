import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text, useCursor } from "@react-three/drei";
import { useNavigate, useParams } from "@/lib/router";
import { Animal } from "../components/Animal";
import { ContainerView } from "../components/ContainerView";
import { palette } from "../palette";

interface StubAnimal {
  id: string;
  name: string;
  color: string;
  position: [number, number, number];
}

// Hardcoded children. Real Paperclip data lands in B4.
const STUB_ANIMALS: StubAnimal[] = [
  { id: "agent-stub-1", name: "BackendWorker-1", color: palette.terracotta, position: [-1.8, 0, 0] },
  { id: "agent-stub-2", name: "BackendWorker-2", color: palette.clay, position: [0, 0, 0] },
  { id: "agent-stub-3", name: "BackendWorker-3", color: palette.deepBlue, position: [1.8, 0, 0] },
];

function ClickableAnimal({
  animal,
  onClick,
}: {
  animal: StubAnimal;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const [x, y, z] = animal.position;
  const lift = hovered ? 0.2 : 0;

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
      <Animal color={animal.color} />
      <Text
        position={[0, -0.45, 1.2]}
        rotation={[-Math.PI / 6, 0, 0]}
        fontSize={0.18}
        color={palette.ink}
        anchorX="center"
        anchorY="middle"
      >
        {animal.name}
      </Text>
    </group>
  );
}

/**
 * RoomView — a room shell with 3 stubbed animals on a grid.
 * Click an animal → AgentView for that stub id.
 */
export function RoomView() {
  const navigate = useNavigate();
  const { companyId, id } = useParams<{ companyId: string; id: string }>();
  const roomName = id ?? "Backend";

  return (
    <div className="h-[calc(100vh-0px)] w-full">
      <Canvas camera={{ position: [6, 5, 7], fov: 45 }} shadows={false} dpr={[1, 2]}>
        <color attach="background" args={[palette.sky]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 3]} intensity={0.6} />

        <ContainerView layer="room" name={roomName}>
          {STUB_ANIMALS.map((animal) => (
            <ClickableAnimal
              key={animal.id}
              animal={animal}
              onClick={() => navigate(`/campus/${companyId}/agent/${animal.id}`)}
            />
          ))}
        </ContainerView>

        <OrbitControls
          enablePan={false}
          minDistance={5}
          maxDistance={16}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.2}
          target={[0, 0.4, 0]}
        />
      </Canvas>
    </div>
  );
}
