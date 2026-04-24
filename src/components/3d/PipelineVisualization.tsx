// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — 3D Pipeline Visualization
//  Phase 4.2 & 4.3: R3F scene with task spheres flowing through a pipeline
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useRef, useMemo, useEffect, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Sphere, Box, Torus } from "@react-three/drei";
import * as THREE from "three";
import type { QueueMetrics, Task } from "@/types";

// ── Color map for statuses ────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  PENDING:    "#94A3B8",
  CLAIMED:    "#F5C518",
  COMPLETED:  "#10B981",
  FAILED:     "#EF4444",
  RECOVERING: "#F97316",
};

// ── Individual task sphere ─────────────────────────────────────────────────────
function TaskSphere({
  position, color, pulsing = false, scale = 1,
}: {
  position: [number, number, number];
  color: string;
  pulsing?: boolean;
  scale?: number;
}) {
  const meshRef    = useRef<THREE.Mesh>(null);
  const glowRef    = useRef<THREE.Mesh>(null);
  const timeOffset = useRef(Math.random() * Math.PI * 2);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime + timeOffset.current;
    if (pulsing) {
      const s = scale * (1 + Math.sin(t * 3) * 0.08);
      meshRef.current.scale.setScalar(s);
    }
    meshRef.current.rotation.y += 0.01;
    if (glowRef.current) {
      glowRef.current.scale.setScalar(scale * (1.5 + Math.sin(t * 2) * 0.1));
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.06 + Math.sin(t * 2) * 0.02;
    }
  });

  return (
    <group position={position}>
      {/* Glow sphere */}
      <Sphere ref={glowRef} args={[0.18, 12, 12]}>
        <meshBasicMaterial color={color} transparent opacity={0.08} depthWrite={false} />
      </Sphere>
      {/* Main sphere */}
      <Sphere ref={meshRef} args={[0.12, 16, 16]} scale={scale}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.4}
          metalness={0.3}
          roughness={0.2}
        />
      </Sphere>
    </group>
  );
}

// ── Pipeline node (box representing a stage) ──────────────────────────────────
function PipelineNode({
  position, label, color, count,
}: {
  position: [number, number, number];
  label:    string;
  color:    string;
  count:    number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current || !ringRef.current) return;
    const t = state.clock.elapsedTime;
    meshRef.current.rotation.y = Math.sin(t * 0.5) * 0.05;
    ringRef.current.rotation.z += 0.005;
    ringRef.current.rotation.x += 0.003;
  });

  return (
    <group position={position}>
      {/* Rotating ring */}
      <Torus ref={ringRef} args={[0.4, 0.02, 8, 32]}>
        <meshBasicMaterial color={color} transparent opacity={0.3} />
      </Torus>

      {/* Main node box */}
      <Box ref={meshRef} args={[0.6, 0.6, 0.6]}>
        <meshStandardMaterial
          color="#1A2235"
          emissive={color}
          emissiveIntensity={0.08}
          metalness={0.6}
          roughness={0.3}
          wireframe={false}
        />
      </Box>

      {/* Wireframe overlay */}
      <Box args={[0.62, 0.62, 0.62]}>
        <meshBasicMaterial color={color} transparent opacity={0.15} wireframe />
      </Box>

      {/* Label */}
      <Text
        position={[0, -0.65, 0]}
        fontSize={0.14}
        color={color}
        anchorX="center"
        anchorY="middle"
        font="/fonts/JetBrainsMono-Regular.ttf"
      >
        {label}
      </Text>

      {/* Count badge */}
      <Text
        position={[0, 0, 0.35]}
        fontSize={0.18}
        color={color}
        anchorX="center"
        anchorY="middle"
        font="/fonts/JetBrainsMono-Regular.ttf"
      >
        {count.toString()}
      </Text>
    </group>
  );
}

// ── Connecting pipe (tube between nodes) ──────────────────────────────────────
function Pipe({ from, to, color = "#243352" }: { from: [number,number,number]; to: [number,number,number]; color?: string }) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(...from),
      new THREE.Vector3((from[0] + to[0]) / 2, from[1] + 0.3, (from[2] + to[2]) / 2),
      new THREE.Vector3(...to),
    ]);
    return new THREE.TubeGeometry(curve, 20, 0.03, 6, false);
  }, [from, to]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} transparent opacity={0.4} metalness={0.5} roughness={0.5} />
    </mesh>
  );
}

// ── Animated flowing particles along pipes ────────────────────────────────────
function FlowParticle({ from, to, speed = 1, color }: {
  from: [number,number,number]; to: [number,number,number]; speed?: number; color: string;
}) {
  const meshRef  = useRef<THREE.Mesh>(null);
  const progress = useRef(Math.random());
  const curve    = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(...from),
    new THREE.Vector3((from[0] + to[0]) / 2, from[1] + 0.3, (from[2] + to[2]) / 2),
    new THREE.Vector3(...to),
  ]), [from, to]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    progress.current = (progress.current + delta * speed * 0.25) % 1;
    const pt = curve.getPoint(progress.current);
    meshRef.current.position.set(pt.x, pt.y, pt.z);
  });

  return (
    <Sphere ref={meshRef} args={[0.04, 6, 6]}>
      <meshBasicMaterial color={color} />
    </Sphere>
  );
}

// ── DLQ Danger Box ─────────────────────────────────────────────────────────────
function DLQBox({ position, count }: { position: [number,number,number]; count: number }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.x += 0.005;
    meshRef.current.rotation.y += 0.008;
    const t = state.clock.elapsedTime;
    meshRef.current.position.y = position[1] + Math.sin(t * 1.5) * 0.05;
  });

  return (
    <group position={position}>
      <Box ref={meshRef} args={[0.55, 0.55, 0.55]}>
        <meshStandardMaterial color="#1a0a0a" emissive="#EF4444" emissiveIntensity={0.15} metalness={0.7} roughness={0.2} />
      </Box>
      <Box args={[0.58, 0.58, 0.58]}>
        <meshBasicMaterial color="#EF4444" transparent opacity={0.2} wireframe />
      </Box>
      <Text position={[0, -0.65, 0]} fontSize={0.13} color="#EF4444" anchorX="center">DLQ</Text>
      <Text position={[0, 0, 0.32]} fontSize={0.18} color="#EF4444" anchorX="center">{count.toString()}</Text>
    </group>
  );
}

// ── Scene camera rig ──────────────────────────────────────────────────────────
function CameraSetup() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 2.5, 6);
    camera.lookAt(0, 0, 0);
  }, [camera]);
  return null;
}

// ── Grid Floor ────────────────────────────────────────────────────────────────
function GridFloor() {
  return (
    <gridHelper args={[20, 20, "#1E2D45", "#111827"]} position={[0, -1.5, 0]} />
  );
}

// ── Main 3D Scene ─────────────────────────────────────────────────────────────
function PipelineScene({ metrics, tasks }: { metrics: QueueMetrics; tasks: Task[] }) {
  // Node positions along a horizontal pipeline
  const nodes: Array<{ pos: [number,number,number]; label: string; color: string; count: number }> = [
    { pos: [-4.5, 0, 0], label: "PRODUCER",  color: "#8B5CF6", count: 0            },
    { pos: [-2,   0, 0], label: "PENDING",   color: "#94A3B8", count: metrics.pending    },
    { pos: [0,    0, 0], label: "CLAIMED",   color: "#F5C518", count: metrics.claimed    },
    { pos: [2,    0, 0], label: "COMPLETED", color: "#10B981", count: metrics.completed  },
    { pos: [4.5,  0, 0], label: "SINK",      color: "#06B6D4", count: 0            },
  ];

  // Scatter task spheres near their respective node
  const taskSpheres = useMemo(() => {
    return tasks.slice(0, 30).map((t) => {
      const nodeIdx = ["PENDING","CLAIMED","COMPLETED","FAILED","RECOVERING"]
        .indexOf(t.status);
      const baseX = [-2, 0, 2, 2, 0][Math.max(0, nodeIdx)];
      return {
        id:    t.task_id,
        color: STATUS_COLORS[t.status] || "#94A3B8",
        pos: [
          baseX + (Math.random() - 0.5) * 1.2,
          (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 1.2,
        ] as [number,number,number],
        pulsing: t.status === "CLAIMED",
      };
    });
  }, [tasks]);

  return (
    <>
      <CameraSetup />
      <GridFloor />

      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <pointLight position={[0,  4, 2]} intensity={1}   color="#F5C518" />
      <pointLight position={[-4, 2, 2]} intensity={0.5} color="#8B5CF6" />
      <pointLight position={[4,  2, 2]} intensity={0.5} color="#06B6D4" />
      <pointLight position={[2,  3, 2]} intensity={0.8} color="#10B981" />

      {/* Pipes */}
      {nodes.slice(0, -1).map((n, i) => (
        <Pipe key={i} from={n.pos} to={nodes[i + 1].pos} color="#243352" />
      ))}
      {/* Fail branch pipe to DLQ */}
      <Pipe from={[0, 0, 0]} to={[0, -1.8, 0]} color="#EF444440" />

      {/* Flow particles */}
      {Array.from({ length: 4 }).map((_, i) => (
        <FlowParticle key={`p-pend-${i}`} from={[-4.5,0,0]} to={[-2,0,0]} speed={0.6 + i * 0.15} color="#8B5CF6" />
      ))}
      {Array.from({ length: 3 }).map((_, i) => (
        <FlowParticle key={`p-claim-${i}`} from={[-2,0,0]} to={[0,0,0]} speed={0.5 + i * 0.2} color="#F5C518" />
      ))}
      {Array.from({ length: 4 }).map((_, i) => (
        <FlowParticle key={`p-comp-${i}`} from={[0,0,0]} to={[2,0,0]} speed={0.7 + i * 0.1} color="#10B981" />
      ))}
      {Array.from({ length: 2 }).map((_, i) => (
        <FlowParticle key={`p-sink-${i}`} from={[2,0,0]} to={[4.5,0,0]} speed={0.8 + i * 0.2} color="#06B6D4" />
      ))}

      {/* Pipeline nodes */}
      {nodes.map((n, i) => (
        <PipelineNode key={i} position={n.pos} label={n.label} color={n.color} count={n.count} />
      ))}

      {/* DLQ box below the pipeline */}
      <DLQBox position={[0, -2.2, 0]} count={metrics.dlq} />

      {/* Task spheres */}
      {taskSpheres.map((s) => (
        <TaskSphere key={s.id} position={s.pos} color={s.color} pulsing={s.pulsing} />
      ))}

      {/* Recovering spheres orbiting the CLAIMED node */}
      {metrics.recovering > 0 && Array.from({ length: Math.min(metrics.recovering, 5) }).map((_, i) => {
        const angle = (i / 5) * Math.PI * 2;
        return (
          <TaskSphere key={`rec-${i}`}
            position={[Math.cos(angle) * 0.9, Math.sin(angle) * 0.9, 0]}
            color="#F97316" pulsing scale={0.8}
          />
        );
      })}

      <OrbitControls
        enablePan={false} enableZoom={true}
        minDistance={3}   maxDistance={12}
        minPolarAngle={0.3} maxPolarAngle={Math.PI / 2}
        autoRotate autoRotateSpeed={0.3}
      />
    </>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
export default function PipelineVisualization({
  metrics, tasks,
}: {
  metrics: QueueMetrics;
  tasks:   Task[];
}) {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 2.5, 6], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={null}>
          <PipelineScene metrics={metrics} tasks={tasks} />
        </Suspense>
      </Canvas>
    </div>
  );
}