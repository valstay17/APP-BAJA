"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { type Sensor, INITIAL_SENSORS } from "@/lib/sensors/sensor-types";

type SensorTelemetry = {
  [key: string]: unknown;
  deviceId?: string;
  sensorValue?: unknown;
  timestamp?: unknown;
  msgTimestamp?: unknown;
  updatedAt?: unknown;
  payload?: Record<string, unknown>;
};

type LatestSensorsResponse = {
  items?: SensorTelemetry[];
};

const DEFAULT_DEVICE_ID = "ESP32";

// Bandas de severidad para deformacion (magnitud absoluta).
// Ajusta estos umbrales con datos reales de tu estructura tubular.
const DEFORMATION_ACCEPTABLE_MAX = 250;
const DEFORMATION_CRITICAL_MIN = 500;

function resolvePath(source: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, source);
}

function collectPaths(
  source: Record<string, unknown>,
  prefix = "",
  results = new Set<string>(),
): string[] {
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    results.add(path);

    if (value && typeof value === "object" && !Array.isArray(value)) {
      collectPaths(value as Record<string, unknown>, path, results);
    }
  }

  return [...results].sort((left, right) => left.localeCompare(right));
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toDate(value: unknown): Date {
  if (typeof value !== "number" || !Number.isFinite(value)) return new Date();
  return value > 1e12 ? new Date(value) : new Date(value * 1000);
}

function getTelemetryNumber(data: SensorTelemetry, attributePath: string): number {
  const source = data.payload && typeof data.payload === "object" ? data.payload : data;
  const value = resolvePath(source as Record<string, unknown>, attributePath);
  if (value !== undefined) return toNumber(value);
  return toNumber(data.sensorValue);
}

function getSensorStatus(value: number, hasTelemetry: boolean): Sensor["status"] {
  if (!hasTelemetry) return "idle";

  const magnitude = Math.abs(value);
  if (magnitude >= DEFORMATION_CRITICAL_MIN) return "error";
  if (magnitude > DEFORMATION_ACCEPTABLE_MAX) return "warning";
  return "active";
}

function pickNextAttributePath(sensors: Sensor[], telemetryPaths: string[]): string {
  const usedPaths = new Set(sensors.map((sensor) => sensor.attributePath).filter(Boolean));
  const availablePaths = telemetryPaths.filter((path) => !usedPaths.has(path));
  if (availablePaths.length > 0) return availablePaths[0];
  return telemetryPaths[0] ?? "sensorValue";
}

function pickNextDeviceId(sensors: Sensor[], availableDeviceIds: string[]): string | null {
  const usedDeviceIds = new Set(sensors.map((sensor) => sensor.deviceId).filter(Boolean));
  const availableIds = availableDeviceIds.filter((deviceId) => !usedDeviceIds.has(deviceId));
  if (availableIds.length > 0) return availableIds[0];
  return null;
}

type SensorCtx = {
  sensors: Sensor[];
  telemetryPaths: string[];
  selectedId: string | null;
  isPlacingSensor: boolean;
  select: (id: string | null) => void;
  startPlacingSensor: () => void;
  cancelPlacingSensor: () => void;
  addSensorAtPosition: (position: [number, number, number]) => void;
  updateSensorAttributePath: (id: string, attributePath: string) => void;
  removeSensor: (id: string) => void;
  updateSensorPosition: (id: string, axis: "x" | "y" | "z", value: number) => void;
};

const SensorContext = createContext<SensorCtx | null>(null);

export function SensorProvider({ children }: { children: ReactNode }) {
  const [sensors, setSensors] = useState<Sensor[]>(INITIAL_SENSORS);
  const [telemetryPaths, setTelemetryPaths] = useState<string[]>(["sensorValue"]);
  const [availableDeviceIds, setAvailableDeviceIds] = useState<string[]>([DEFAULT_DEVICE_ID]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPlacingSensor, setIsPlacingSensor] = useState(false);

  useEffect(() => {
    const syncSensors = async () => {
      try {
        const res = await fetch("/api/sensors/latest?deviceId=all", {
          cache: "no-store",
        });

        if (!res.ok) return;

        const payload = (await res.json()) as SensorTelemetry | LatestSensorsResponse;
        const telemetryItems =
          "items" in payload && Array.isArray(payload.items)
            ? payload.items
            : [payload as SensorTelemetry];

        const latestByDeviceId = new Map<string, SensorTelemetry>();
        const pathSet = new Set<string>();

        for (const item of telemetryItems) {
          if (!item || typeof item !== "object") continue;

          for (const path of collectPaths(item)) {
            pathSet.add(path);
          }

          if (typeof item.deviceId === "string" && item.deviceId.trim().length > 0) {
            latestByDeviceId.set(item.deviceId, item);
          }
        }

        setTelemetryPaths(pathSet.size > 0 ? [...pathSet].sort((a, b) => a.localeCompare(b)) : ["sensorValue"]);

        const knownDeviceIds = [...latestByDeviceId.keys()].sort((a, b) => a.localeCompare(b));
        setAvailableDeviceIds(knownDeviceIds.length > 0 ? knownDeviceIds : [DEFAULT_DEVICE_ID]);

        setSensors((prev) => {
          return prev.map((sensor) => {
            const telemetry = latestByDeviceId.get(sensor.deviceId);
            if (!telemetry) {
              return {
                ...sensor,
                status: "idle",
              };
            }

            const rawTimestamp = telemetry.timestamp ?? telemetry.msgTimestamp ?? telemetry.updatedAt;
            const updatedAt = toDate(rawTimestamp);
            const value = getTelemetryNumber(telemetry, sensor.attributePath);

            return {
              ...sensor,
              value,
              baseValue: value,
              updatedAt,
              status: getSensorStatus(value, true),
            };
          });
        });
      } catch {
        // Ignore transient network errors; next poll will retry.
      }
    };

    syncSensors();
    const id = setInterval(syncSensors, 3000);
    return () => clearInterval(id);
  }, []);

  const select = useCallback((id: string | null) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const startPlacingSensor = useCallback(() => {
    setSelectedId(null);
    setIsPlacingSensor(true);
  }, []);

  const cancelPlacingSensor = useCallback(() => {
    setIsPlacingSensor(false);
  }, []);

  const addSensorAtPosition = useCallback((position: [number, number, number]) => {
    setSensors((prev) => {
      const nextIndex =
        prev.reduce((max, sensor) => {
          const parsed = Number.parseInt(sensor.id.replace(/^s/, ""), 10);
          return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
        }, 0) + 1;
      const attributePath = pickNextAttributePath(prev, telemetryPaths);
      const deviceId = pickNextDeviceId(prev, availableDeviceIds);
      if (!deviceId) return prev;
      const newSensor: Sensor = {
        id: `s${nextIndex}`,
        deviceId,
        attributePath,
        name: `Nuevo sensor ${nextIndex} · ${deviceId}`,
        zone: "Chasis",
        unit: "u",
        value: 0,
        baseValue: 0,
        status: "idle",
        updatedAt: new Date(),
        position,
      };

      setSelectedId(newSensor.id);
      return [...prev, newSensor];
    });
  }, [availableDeviceIds, telemetryPaths]);

  const updateSensorAttributePath = useCallback((id: string, attributePath: string) => {
    setSensors((prev) =>
      prev.map((sensor) =>
        sensor.id === id
          ? {
              ...sensor,
              attributePath,
            }
          : sensor,
      ),
    );
  }, []);

  const removeSensor = useCallback((id: string) => {
    setSensors((prev) => prev.filter((sensor) => sensor.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

  const updateSensorPosition = useCallback(
    (id: string, axis: "x" | "y" | "z", value: number) => {
      const axisIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;

      setSensors((prev) =>
        prev.map((sensor) => {
          if (sensor.id !== id) return sensor;

          const nextPosition: [number, number, number] = [...sensor.position] as [
            number,
            number,
            number,
          ];
          nextPosition[axisIndex] = parseFloat(value.toFixed(4));

          return {
            ...sensor,
            position: nextPosition,
          };
        }),
      );
    },
    [],
  );

  return (
    <SensorContext.Provider
      value={{
        sensors,
        telemetryPaths,
        selectedId,
        isPlacingSensor,
        select,
        startPlacingSensor,
        cancelPlacingSensor,
        addSensorAtPosition,
        updateSensorAttributePath,
        removeSensor,
        updateSensorPosition,
      }}
    >
      {children}
    </SensorContext.Provider>
  );
}

export function useSensors(): SensorCtx {
  const ctx = useContext(SensorContext);
  if (!ctx) throw new Error("useSensors must be used inside <SensorProvider>");
  return ctx;
}
