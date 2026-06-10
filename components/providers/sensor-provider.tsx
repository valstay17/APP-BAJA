"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { type Sensor, type SensorLayout, INITIAL_SENSORS } from "@/lib/sensors/sensor-types";

type SensorTelemetry = {
  [key: string]: unknown;
  deviceId?: string;
  sensorValue?: unknown;
  timestamp?: unknown;
  msgTimestamp?: unknown;
  updatedAt?: unknown;
  channels?: Array<Record<string, unknown>>;
  payload?: Record<string, unknown>;
};

type LatestSensorsResponse = {
  items?: SensorTelemetry[];
};

type SensorLayoutResponse = {
  sensors?: SensorLayout[];
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

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const arrayPath = `${path}.${index}`;
        results.add(arrayPath);

        if (item && typeof item === "object") {
          collectPaths(item as Record<string, unknown>, arrayPath, results);
        }
      });
      continue;
    }

    if (value && typeof value === "object") {
      collectPaths(value as Record<string, unknown>, path, results);
    }
  }

  return [...results].sort((left, right) => left.localeCompare(right));
}

function getChannelArray(data: SensorTelemetry): Array<Record<string, unknown>> {
  if (Array.isArray(data.channels)) return data.channels;

  const payloadChannels = data.payload?.channels;
  if (Array.isArray(payloadChannels)) return payloadChannels as Array<Record<string, unknown>>;

  return [];
}

function getChannelAttributePaths(data: SensorTelemetry): string[] {
  const channels = getChannelArray(data);
  if (channels.length === 0) return [];

  return channels.map((channel, index) => {
    if (channel && typeof channel === "object" && "deformation" in channel) {
      return `channels.${index}.deformation`;
    }

    if (channel && typeof channel === "object" && "rawDelta" in channel) {
      return `channels.${index}.rawDelta`;
    }

    return `channels.${index}.deformation`;
  });
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

function sensorToLayout(sensor: Sensor): SensorLayout {
  return {
    id: sensor.id,
    deviceId: sensor.deviceId,
    attributePath: sensor.attributePath,
    name: sensor.name,
    zone: sensor.zone,
    unit: sensor.unit,
    position: sensor.position,
  };
}

function layoutToSensor(layout: SensorLayout): Sensor {
  return {
    ...layout,
    value: 0,
    baseValue: 0,
    status: "idle",
    updatedAt: new Date(),
  };
}

function normalizeLayout(value: unknown): SensorLayout | null {
  if (!value || typeof value !== "object") return null;

  const sensor = value as Partial<SensorLayout>;

  if (
    typeof sensor.id !== "string" ||
    typeof sensor.deviceId !== "string" ||
    typeof sensor.attributePath !== "string" ||
    typeof sensor.name !== "string" ||
    typeof sensor.zone !== "string" ||
    typeof sensor.unit !== "string" ||
    !Array.isArray(sensor.position) ||
    sensor.position.length !== 3
  ) {
    return null;
  }

  const position = sensor.position.map((coordinate) => Number(coordinate)) as [number, number, number];
  if (position.some((coordinate) => !Number.isFinite(coordinate))) return null;

  return {
    id: sensor.id,
    deviceId: sensor.deviceId,
    attributePath: sensor.attributePath,
    name: sensor.name,
    zone: sensor.zone,
    unit: sensor.unit,
    position,
  };
}

function normalizeLayoutList(value: unknown): SensorLayout[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeLayout).filter((sensor): sensor is SensorLayout => sensor !== null);
}

async function loadSensorLayout(): Promise<SensorLayout[] | null> {
  try {
    const response = await fetch("/api/sensors/config", { cache: "no-store" });
    if (!response.ok) return null;

    const payload = (await response.json()) as SensorLayoutResponse;
    return normalizeLayoutList(payload.sensors);
  } catch {
    return null;
  }
}

async function saveSensorLayout(layout: SensorLayout[]) {
  try {
    await fetch("/api/sensors/config", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sensors: layout }),
    });
  } catch {
    // Ignore transient network issues; the next edit will retry.
  }
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

function pickNextDeviceId(
  sensors: Sensor[],
  deviceChannelPaths: Record<string, string[]>,
): string | null {
  const sensorCounts = new Map<string, number>();

  for (const sensor of sensors) {
    sensorCounts.set(sensor.deviceId, (sensorCounts.get(sensor.deviceId) ?? 0) + 1);
  }

  const availableIds = Object.keys(deviceChannelPaths).sort((left, right) => left.localeCompare(right));

  for (const deviceId of availableIds) {
    const capacity = Math.max(deviceChannelPaths[deviceId]?.length ?? 0, 1);
    if ((sensorCounts.get(deviceId) ?? 0) < capacity) return deviceId;
  }

  return null;
}

type SensorCtx = {
  sensors: Sensor[];
  telemetryPaths: string[];
  selectedId: string | null;
  isPlacingSensor: boolean;
  isEditingSensors: boolean;
  select: (id: string | null) => void;
  startPlacingSensor: () => void;
  cancelPlacingSensor: () => void;
  startEditingSensors: () => void;
  stopEditingSensors: () => void;
  addSensorAtPosition: (position: [number, number, number]) => void;
  updateSensorAttributePath: (id: string, attributePath: string) => void;
  removeSensor: (id: string) => void;
  updateSensorPosition: (id: string, axis: "x" | "y" | "z", value: number) => void;
};

const SensorContext = createContext<SensorCtx | null>(null);

export function SensorProvider({ children }: { children: ReactNode }) {
  const [sensors, setSensors] = useState<Sensor[]>(INITIAL_SENSORS);
  const [telemetryPaths, setTelemetryPaths] = useState<string[]>(["sensorValue"]);
  const [deviceChannelPaths, setDeviceChannelPaths] = useState<Record<string, string[]>>({
    [DEFAULT_DEVICE_ID]: ["channels.0.deformation"],
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPlacingSensor, setIsPlacingSensor] = useState(false);
  const [isEditingSensors, setIsEditingSensors] = useState(false);
  const [hasLoadedLayout, setHasLoadedLayout] = useState(false);
  const lastPersistedLayoutRef = useRef("");

  useEffect(() => {
    const bootstrap = async () => {
      const layouts = await loadSensorLayout();
      if (layouts !== null) {
        const hydratedSensors = layouts.map(layoutToSensor);
        setSensors(hydratedSensors);
        lastPersistedLayoutRef.current = JSON.stringify(layouts);
      } else {
        lastPersistedLayoutRef.current = JSON.stringify([]);
      }

      setHasLoadedLayout(true);
    };

    void bootstrap();
  }, []);

  useEffect(() => {
    if (!hasLoadedLayout) return;

    const layout = sensors.map(sensorToLayout);
    const layoutJson = JSON.stringify(layout);

    if (layoutJson === lastPersistedLayoutRef.current) return;

    lastPersistedLayoutRef.current = layoutJson;
    void saveSensorLayout(layout);
  }, [hasLoadedLayout, sensors]);

  useEffect(() => {
    if (!hasLoadedLayout) return;

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
        const channelPathsByDeviceId: Record<string, string[]> = {};
        const pathSet = new Set<string>();

        for (const item of telemetryItems) {
          if (!item || typeof item !== "object") continue;

          for (const path of collectPaths(item)) {
            pathSet.add(path);
          }

          if (typeof item.deviceId === "string" && item.deviceId.trim().length > 0) {
            latestByDeviceId.set(item.deviceId, item);
            const channelPaths = getChannelAttributePaths(item);
            channelPathsByDeviceId[item.deviceId] = channelPaths.length > 0 ? channelPaths : ["sensorValue"];
          }
        }

        for (const item of telemetryItems) {
          const payload = item?.payload;
          const payloadDeviceId =
            payload && typeof payload === "object" && typeof payload.deviceId === "string"
              ? payload.deviceId
              : null;

          if (!payloadDeviceId || payloadDeviceId.trim().length === 0) continue;

          const channelPaths = getChannelAttributePaths({
            ...(item as SensorTelemetry),
            deviceId: payloadDeviceId,
            channels: Array.isArray(payload.channels) ? (payload.channels as Array<Record<string, unknown>>) : undefined,
          });

          if (channelPaths.length > 0) {
            channelPathsByDeviceId[payloadDeviceId] = channelPaths;
          }
        }

        setTelemetryPaths(pathSet.size > 0 ? [...pathSet].sort((a, b) => a.localeCompare(b)) : ["sensorValue"]);
        setDeviceChannelPaths(
          Object.keys(channelPathsByDeviceId).length > 0
            ? channelPathsByDeviceId
            : { [DEFAULT_DEVICE_ID]: ["channels.0.deformation"] },
        );

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
  }, [hasLoadedLayout]);

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

  const startEditingSensors = useCallback(() => {
    setIsEditingSensors(true);
  }, []);

  const stopEditingSensors = useCallback(() => {
    setIsEditingSensors(false);
  }, []);

  const addSensorAtPosition = useCallback((position: [number, number, number]) => {
    setSensors((prev) => {
      const nextIndex =
        prev.reduce((max, sensor) => {
          const parsed = Number.parseInt(sensor.id.replace(/^s/, ""), 10);
          return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
        }, 0) + 1;
      const deviceId = pickNextDeviceId(prev, deviceChannelPaths);
      if (!deviceId) return prev;
      const deviceSensors = prev.filter((sensor) => sensor.deviceId === deviceId);
      const attributePath = pickNextAttributePath(
        deviceSensors,
        deviceChannelPaths[deviceId] ?? telemetryPaths,
      );
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
  }, [deviceChannelPaths, telemetryPaths]);

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
      if (!isEditingSensors) return;

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
    [isEditingSensors],
  );

  return (
    <SensorContext.Provider
      value={{
        sensors,
        telemetryPaths,
        selectedId,
        isPlacingSensor,
        isEditingSensors,
        select,
        startPlacingSensor,
        cancelPlacingSensor,
        startEditingSensors,
        stopEditingSensors,
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
