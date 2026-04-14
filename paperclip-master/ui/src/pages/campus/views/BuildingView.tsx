import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Edges, OrbitControls, Text, useCursor } from "@react-three/drei";
import { useNavigate, useParams } from "@/lib/router";
import type { Agent } from "@paperclipai/shared";
import { ContainerView } from "../components/ContainerView";
import {
  EmptyLayerOverlay,
  LoadingOverlay,
  NotFoundOverlay,
} from "../components/SceneOverlays";
import { useContainerChildren } from "../hooks/useContainerChildren";
import { palette } from "../palette";

function FloorSlabPlaceholder({
  agent,
  y,
  onClick,
}: {
  agent: Agent;
  y: number;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const lift = hovered ? 0.12 : 0;

  return (
    <group
      position={[0, y + lift, 0]}
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
        {agent.name}
      </Text>
    </group>
  );
}

/**
 * BuildingView — a building shell with one slab per child floor agent.
 * Click → FloorView for that agent's id.
 */
export function BuildingView() {
  const navigate = useNavigate();
  const { companyId, id } = useParams<{ companyId: string; id: string }>();
  const { self, children, loading } = useContainerChildren(companyId ?? "", id ?? null);
  const buildingName = self?.name ?? id ?? "Building";

  const showNotFound = !loading && !!id && self === null;

  return (
    <div className="h-[calc(100vh-0px)] w-full">
      <Canvas camera={{ position: [10, 6, 12], fov: 45 }} shadows={false} dpr={[1, 2]}>
        <color attach="background" args={[palette.sky]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 3]} intensity={0.6} />

        <ContainerView layer="building" name={buildingName}>
          {loading ? (
            <LoadingOverlay />
          ) : showNotFound ? (
            <NotFoundOverlay
              layer="building"
              backHref={`/campus/${companyId}`}
              backLabel="campus"
            />
          ) : children.length === 0 ? (
            <EmptyLayerOverlay layer="building" />
          ) : (
            children.map((agent, i) => (
              <FloorSlabPlaceholder
                key={agent.id}
                agent={agent}
                y={0.5 + i * 2}
                onClick={() => navigate(`/campus/${companyId}/floor/${agent.id}`)}
              />
            ))
          )}
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
