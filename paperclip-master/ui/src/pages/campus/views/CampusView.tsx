import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Edges, OrbitControls, Text, useCursor } from "@react-three/drei";
import { useNavigate, useParams } from "@/lib/router";
import type { Agent } from "@paperclipai/shared";
import { ContainerView } from "../components/ContainerView";
import { EmptyLayerOverlay, LoadingOverlay } from "../components/SceneOverlays";
import { useContainerChildren } from "../hooks/useContainerChildren";
import { palette } from "../palette";

/** Lay out N buildings on a loose grid centered at the origin. */
function buildingPosition(index: number, total: number): [number, number, number] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
  const spacing = 7;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const rows = Math.max(1, Math.ceil(total / cols));
  const x = (col - (cols - 1) / 2) * spacing;
  const z = (row - (rows - 1) / 2) * spacing;
  return [x, 0, z];
}

function BuildingPlaceholder({
  agent,
  position,
  onClick,
}: {
  agent: Agent;
  position: [number, number, number];
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const [x, y, z] = position;
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
        {agent.name}
      </Text>
    </group>
  );
}

/**
 * CampusView — a ground plane with one building per campus-layer root agent.
 * Click → BuildingView for that agent's id.
 */
export function CampusView() {
  const navigate = useNavigate();
  const { companyId } = useParams<{ companyId: string }>();
  const { children, loading } = useContainerChildren(companyId ?? "", null);
  const campusName = companyId ?? "Zootropolis";

  return (
    <div className="h-[calc(100vh-0px)] w-full">
      <Canvas camera={{ position: [14, 12, 18], fov: 45 }} shadows={false} dpr={[1, 2]}>
        <color attach="background" args={[palette.sky]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 3]} intensity={0.6} />

        <ContainerView layer="campus" name={campusName}>
          {loading ? (
            <LoadingOverlay />
          ) : children.length === 0 ? (
            <EmptyLayerOverlay layer="campus" />
          ) : (
            children.map((agent, i) => (
              <BuildingPlaceholder
                key={agent.id}
                agent={agent}
                position={buildingPosition(i, children.length)}
                onClick={() => navigate(`/campus/${companyId}/building/${agent.id}`)}
              />
            ))
          )}
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
