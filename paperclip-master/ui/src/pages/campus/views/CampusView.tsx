import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Edges, OrbitControls, Text, useCursor } from "@react-three/drei";
import { useNavigate, useParams } from "@/lib/router";
import { ContainerView } from "../components/ContainerView";
import { palette } from "../palette";

interface StubBuilding {
  id: string;
  name: string;
  position: [number, number, number];
}

const STUB_BUILDINGS: StubBuilding[] = [
  { id: "building-hq", name: "HQ", position: [-7, 0, -2] },
  { id: "building-engineering", name: "Engineering", position: [0, 0, 0] },
  { id: "building-research", name: "Research", position: [7, 0, 2] },
];

function BuildingPlaceholder({
  building,
  onClick,
}: {
  building: StubBuilding;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const [x, y, z] = building.position;
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
      {/* Body */}
      <mesh position={[0, 1.6, 0]}>
        <boxGeometry args={[3, 3.2, 3]} />
        <meshLambertMaterial color={palette.bone} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      {/* Roof */}
      <mesh position={[0, 3.35, 0]}>
        <boxGeometry args={[3.3, 0.3, 3.3]} />
        <meshLambertMaterial color={palette.clay} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      <Text
        position={[0, 0.05, 1.8]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.32}
        color={palette.ink}
        anchorX="center"
        anchorY="middle"
      >
        {building.name}
      </Text>
    </group>
  );
}

/**
 * CampusView — a ground plane with 2–3 buildings on a grid.
 * Click → BuildingView for that building id.
 */
export function CampusView() {
  const navigate = useNavigate();
  const { companyId } = useParams<{ companyId: string }>();
  const campusName = companyId ?? "Zootropolis";

  return (
    <div className="h-[calc(100vh-0px)] w-full">
      <Canvas camera={{ position: [14, 12, 18], fov: 45 }} shadows={false} dpr={[1, 2]}>
        <color attach="background" args={[palette.sky]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 3]} intensity={0.6} />

        <ContainerView layer="campus" name={campusName}>
          {STUB_BUILDINGS.map((building) => (
            <BuildingPlaceholder
              key={building.id}
              building={building}
              onClick={() => navigate(`/campus/${companyId}/building/${building.id}`)}
            />
          ))}
        </ContainerView>

        <OrbitControls
          enablePan={false}
          minDistance={10}
          maxDistance={40}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.2}
          target={[0, 0, 0]}
        />
      </Canvas>
    </div>
  );
}
