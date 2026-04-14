import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { useParams } from "@/lib/router";
import { Animal } from "../components/Animal";
import { StatusLight } from "../components/StatusLight";
import { palette } from "../palette";

/**
 * AgentView — single-leaf-agent R3F scene.
 * B1: hardcoded stub. Real Paperclip data comes in B4.
 */
export function AgentView() {
  const { id } = useParams<{ id: string }>();
  const label = id ?? "test-agent";

  return (
    <div className="h-[calc(100vh-0px)] w-full">
      <Canvas
        camera={{ position: [4, 3.5, 5], fov: 45 }}
        shadows={false}
        dpr={[1, 2]}
      >
        <color attach="background" args={[palette.sky]} />

        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 3]} intensity={0.6} />

        {/* Ground */}
        <mesh position={[0, -0.45, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[30, 30]} />
          <meshLambertMaterial color={palette.ground} />
        </mesh>

        <Animal />
        <StatusLight mode="idle" />

        <Text
          position={[0, -0.9, 1.2]}
          rotation={[-Math.PI / 6, 0, 0]}
          fontSize={0.24}
          color={palette.ink}
          anchorX="center"
          anchorY="middle"
        >
          {label}
        </Text>

        <OrbitControls
          enablePan={false}
          minDistance={4}
          maxDistance={12}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.2}
          target={[0, 0.8, 0]}
        />
      </Canvas>
    </div>
  );
}
