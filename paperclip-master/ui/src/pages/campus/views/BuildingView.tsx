import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Edges, OrbitControls, Text, useCursor } from "@react-three/drei";
import { useNavigate, useParams } from "@/lib/router";
import { ContainerView } from "../components/ContainerView";
import { palette } from "../palette";

interface StubFloor {
  id: string;
  name: string;
  y: number;
}

const STUB_FLOORS: StubFloor[] = [
  { id: "floor-engineering", name: "Engineering", y: 0.5 },
  { id: "floor-design", name: "Design", y: 2.5 },
  { id: "floor-ops", name: "Operations", y: 4.5 },
];

function FloorSlabPlaceholder({
  floor,
  onClick,
}: {
  floor: StubFloor;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const lift = hovered ? 0.12 : 0;

  return (
    <group
      position={[0, floor.y + lift, 0]}
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
      <mesh>
        <boxGeometry args={[4.4, 1.2, 4.4]} />
        <meshLambertMaterial color={palette.dustBlue} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      <Text
        position={[0, 0, 2.3]}
        fontSize={0.3}
        color={palette.ink}
        anchorX="center"
        anchorY="middle"
      >
        {floor.name}
      </Text>
    </group>
  );
}

/**
 * BuildingView — a building shell with 2–3 floor slabs stacked vertically.
 * Click → FloorView for that floor id.
 */
export function BuildingView() {
  const navigate = useNavigate();
  const { companyId, id } = useParams<{ companyId: string; id: string }>();
  const buildingName = id ?? "HQ";

  return (
    <div className="h-[calc(100vh-0px)] w-full">
      <Canvas camera={{ position: [10, 6, 12], fov: 45 }} shadows={false} dpr={[1, 2]}>
        <color attach="background" args={[palette.sky]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 3]} intensity={0.6} />

        <ContainerView layer="building" name={buildingName}>
          {STUB_FLOORS.map((floor) => (
            <FloorSlabPlaceholder
              key={floor.id}
              floor={floor}
              onClick={() => navigate(`/campus/${companyId}/floor/${floor.id}`)}
            />
          ))}
        </ContainerView>

        <OrbitControls
          enablePan={false}
          minDistance={6}
          maxDistance={22}
          minPolarAngle={Math.PI / 8}
          maxPolarAngle={Math.PI / 2.2}
          target={[0, 2.5, 0]}
        />
      </Canvas>
    </div>
  );
}
