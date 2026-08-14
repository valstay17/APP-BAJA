"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Bounds, Environment, Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Box3, Vector3 } from "three";
import { DRACOLoader } from "three-stdlib";
import { useSensors } from "@/components/providers/sensor-provider";
import { STATUS_CFG, type Sensor } from "@/lib/sensors/sensor-types";

const MODEL_PATH = "/models/aat_c&e_framemodel3b.glb";
const CAMERA_CONFIG = { position: [4, 2.2, 5] as [number, number, number], fov: 34 };
const MM_PER_UNIT = 1000;

function distanceFromPointsMm(a: [number, number, number], b: [number, number, number]) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const distance = Math.sqrt(dx ** 2 + dy ** 2 + dz ** 2);

  return {
    distanceMm: distance * MM_PER_UNIT,
    deltaMm: [dx * MM_PER_UNIT, dy * MM_PER_UNIT, dz * MM_PER_UNIT] as [number, number, number],
  };
}

function Model({
  onSurfacePointerDown,
}: {
  onSurfacePointerDown: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const gltf = useGLTF(
    MODEL_PATH,
    true,
    true,
    (loader) => {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
      loader.setDRACOLoader(dracoLoader);
    },
  );

  // Centra el chasis una sola vez, de forma determinista, usando la bounding
  // box del modelo ya completamente cargado (gltf.scene). No usamos <Center>
  // de drei porque recalcula el centrado en cada render y el resultado puede
  // variar entre navegadores según el orden/timing en que termina de cargar
  // la geometría (p. ej. velocidad de descarga del decoder DRACO).
  useMemo(() => {
    const box = new Box3().setFromObject(gltf.scene);
    const center = box.getCenter(new Vector3());
    gltf.scene.position.set(-center.x, -center.y, -center.z);
  }, [gltf.scene]);

  return <primitive object={gltf.scene} onPointerDown={onSurfacePointerDown} />;
}

useGLTF.preload(MODEL_PATH);

function Loader() {
  return (
    <Html center>
      <div className="rounded-full border border-white/20 bg-black/65 px-4 py-2 text-sm tracking-[0.18em] text-white uppercase backdrop-blur-sm">
        Cargando modelo
      </div>
    </Html>
  );
}

function SensorHotspot({
  sensor,
  isSelected,
  onSelect,
}: {
  sensor: Sensor;
  isSelected: boolean;
  onSelect: (id: string | null) => void;
}) {
  const cfg = STATUS_CFG[sensor.status];
  const isPulsing = sensor.status === "active" || sensor.status === "warning" || sensor.status === "error";
  const outerRadius = 0.04;
  const coreRadius = 0.022;

  return (
    <group position={sensor.position}>
      {/* Esfera exterior translúcida (anillo visual) */}
      <mesh userData={{ isSensorHotspot: true }}>
        <sphereGeometry args={[outerRadius, 14, 14]} />
        <meshStandardMaterial
          color={cfg.color}
          transparent
          opacity={isPulsing ? 0.22 : 0.08}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>

      {/* Esfera central — exactamente en el punto de intersección */}
      <mesh
        userData={{ isSensorHotspot: true }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(sensor.id);
        }}
      >
        <sphereGeometry args={[coreRadius, 14, 14]} />
        <meshStandardMaterial
          color={cfg.color}
          emissive={cfg.color}
          emissiveIntensity={isSelected ? 3 : 1.2}
          toneMapped={false}
        />
      </mesh>

      {/* Etiqueta HTML — solo texto, sin afectar la posición del punto */}
      <Html center distanceFactor={7} zIndexRange={[10, 0]}>
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelect(sensor.id);
          }}
          className="flex cursor-pointer flex-col items-center"
          style={{ userSelect: "none", marginTop: "28px" }}
        >
          <div
            className={`min-w-[96px] rounded-lg border px-2 py-1 text-center text-[11px] shadow-lg backdrop-blur-md transition-all duration-150 ${
              isSelected
                ? "scale-100 opacity-100"
                : "pointer-events-none scale-90 opacity-0"
            }`}
            style={{
              background: "rgba(5,7,10,0.82)",
              borderColor: cfg.color + "55",
            }}
          >
            <p className="font-semibold leading-tight text-white">{sensor.name}</p>
            <p className="mt-0.5 text-[0.58rem]" style={{ color: cfg.color }}>
              {cfg.label}
              {sensor.status !== "idle" && (
                <> · {sensor.value} {sensor.unit}</>
              )}
            </p>
          </div>
        </div>
      </Html>
    </group>
  );
}

export function GlbViewer() {
  const { sensors, selectedId, isPlacingSensor, select, addSensorAtPosition } = useSensors();
  const [lastPlacedPoint, setLastPlacedPoint] = useState<[number, number, number] | null>(null);
  const [lastDistanceMm, setLastDistanceMm] = useState<number | null>(null);
  const [lastDeltaMm, setLastDeltaMm] = useState<[number, number, number] | null>(null);
  const hasPlacedInCurrentSessionRef = useRef(false);

  useEffect(() => {
    if (!isPlacingSensor) {
      hasPlacedInCurrentSessionRef.current = false;
    }
  }, [isPlacingSensor]);

  const placeSensorFromEvent = (event: ThreeEvent<PointerEvent>) => {
    if (!isPlacingSensor) return;

    const hit = event.intersections.find(
      (intersection) =>
        intersection.face &&
        intersection.object.type === "Mesh" &&
        !intersection.object.userData?.isSensorHotspot,
    );

    if (!hit) return;

    event.stopPropagation();
    const nextPoint: [number, number, number] = [hit.point.x, hit.point.y, hit.point.z];

    if (!hasPlacedInCurrentSessionRef.current) {
      setLastPlacedPoint(null);
      setLastDistanceMm(null);
      setLastDeltaMm(null);
      hasPlacedInCurrentSessionRef.current = true;
    }

    if (lastPlacedPoint) {
      const measurement = distanceFromPointsMm(lastPlacedPoint, nextPoint);
      setLastDistanceMm(measurement.distanceMm);
      setLastDeltaMm(measurement.deltaMm);
    } else {
      setLastDistanceMm(null);
      setLastDeltaMm(null);
    }

    setLastPlacedPoint(nextPoint);
    addSensorAtPosition(nextPoint);
  };

  const handleSurfacePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!isPlacingSensor) return;
    placeSensorFromEvent(event);
  };

  return (
    <div
      className={`relative h-[58vh] min-h-[440px] w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,#244a63_0%,#091018_56%,#05070a_100%)] shadow-[0_30px_120px_rgba(0,0,0,0.45)] lg:h-[78vh] lg:min-h-[700px] ${
        isPlacingSensor ? "cursor-crosshair" : ""
      }`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 text-[0.68rem] uppercase tracking-[0.28em] text-white/60">
        <span>visor 3d</span>
        <span>{isPlacingSensor ? "modo alta · click sobre chasis" : "orbitar · zoom · click en sensor"}</span>
      </div>
      <Canvas camera={CAMERA_CONFIG} dpr={[1, 2]}>
        <color attach="background" args={["#05070a"]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[6, 8, 5]} intensity={3.2} />
        <directionalLight position={[-4, 2, -3]} intensity={1.1} color="#89d2ff" />
        <Suspense fallback={<Loader />}>
          <Bounds fit clip margin={1.15}>
            <Model onSurfacePointerDown={handleSurfacePointerDown} />
          </Bounds>
          <Environment preset="city" />
          {!isPlacingSensor &&
            sensors.map((sensor) => (
              <SensorHotspot
                key={sensor.id}
                sensor={sensor}
                isSelected={selectedId === sensor.id}
                onSelect={select}
              />
            ))}
        </Suspense>
        <OrbitControls
          makeDefault
          enabled={!isPlacingSensor}
          enablePan
          enableDamping
          dampingFactor={0.08}
          screenSpacePanning
          minDistance={0.45}
          maxDistance={48}
          zoomSpeed={1.25}
          panSpeed={1.15}
          rotateSpeed={0.9}
          minPolarAngle={0}
          maxPolarAngle={Math.PI}
          autoRotate={false}
        />
      </Canvas>
      {isPlacingSensor && (
        <div className="pointer-events-none absolute inset-x-5 bottom-24 rounded-3xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100 backdrop-blur-md">
          <p>Toca una parte del chasis para crear un nuevo sensor en ese punto.</p>
          {lastDistanceMm !== null && lastDeltaMm && (
            <p className="mt-1 text-cyan-50/90">
              Distancia desde el punto anterior: {lastDistanceMm.toFixed(2)} mm · ΔX {lastDeltaMm[0].toFixed(2)} · ΔY {lastDeltaMm[1].toFixed(2)} · ΔZ {lastDeltaMm[2].toFixed(2)}
            </p>
          )}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-5 bottom-5 rounded-3xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white/80 backdrop-blur-md">
        <p className="font-medium text-white">AAT_C&E_FRAMEMODEL3B1</p>
        <p className="mt-1 text-white/60">
          {isPlacingSensor
            ? "Modo alta activo · cada click sobre el modelo crea un sensor"
            : selectedId
            ? `Sensor seleccionado · ${sensors.find((s) => s.id === selectedId)?.name}`
            : "Haz click sobre un sensor para ver su detalle"}
        </p>
      </div>
    </div>
  );
}