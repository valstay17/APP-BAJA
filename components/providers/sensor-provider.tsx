"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { type Sensor, INITIAL_SENSORS } from "@/lib/sensors/sensor-types";

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

function getTelemetryNumber(data: SensorTelemetry, attributePath: string): number | null {
  if (attributePath.trim().length === 0) return null;

  const source = data.payload && typeof data.payload === "object" ? data.payload : data;
  const value = resolvePath(source as Record<string, unknown>, attributePath);
  if (value !== undefined) return toNumber(value);
  return null;
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

// ---------------------------------------------------------------------------
// Historial de lecturas (para graficar y exportar a PDF).
// Se persiste en localStorage para no perder datos si se cae la conexión:
// las lecturas siguen acumulándose desde el último estado guardado en cuanto
// vuelve a responder /api/sensors/latest, igual que el buffer offline del ESP32.
// ---------------------------------------------------------------------------

const SENSOR_HISTORY_KEY = "baja:sensor-history";
const MAX_HISTORY_POINTS = 200;

export type SensorReading = { timestamp: number; value: number };
export type SensorHistory = Record<string, SensorReading[]>;

function loadSensorHistory(): SensorHistory {
  try {
    const raw = localStorage.getItem(SENSOR_HISTORY_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as SensorHistory;
  } catch {
    return {};
  }
}

function saveSensorHistory(history: SensorHistory): void {
  try {
    localStorage.setItem(SENSOR_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Ignore storage errors (private mode, quota exceeded, etc.)
  }
}

// ---------------------------------------------------------------------------
// localStorage persistence for sensor configuration (not telemetry values)
// ---------------------------------------------------------------------------

const SENSOR_CONFIG_KEY = "baja:sensor-configs";

type PersistedSensorConfig = Pick<
  Sensor,
  "id" | "deviceId" | "attributePath" | "name" | "zone" | "unit" | "position"
>;

function loadSensorConfigs(): PersistedSensorConfig[] | null {
  try {
    const raw = localStorage.getItem(SENSOR_CONFIG_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as PersistedSensorConfig[];
  } catch {
    return null;
  }
}

function saveSensorConfigs(sensors: Sensor[]): void {
  try {
    const configs: PersistedSensorConfig[] = sensors.map(
      ({ id, deviceId, attributePath, name, zone, unit, position }) => ({
        id,
        deviceId,
        attributePath,
        name,
        zone,
        unit,
        position,
      }),
    );
    localStorage.setItem(SENSOR_CONFIG_KEY, JSON.stringify(configs));
  } catch {
    // Ignore storage errors (private mode, quota exceeded, etc.)
  }
}

// ---------------------------------------------------------------------------

type SensorCtx = {
  sensors: Sensor[];
  telemetryPaths: string[];
  deviceIds: string[];
  selectedId: string | null;
  isPlacingSensor: boolean;
  history: SensorHistory;
  select: (id: string | null) => void;
  startPlacingSensor: () => void;
  cancelPlacingSensor: () => void;
  addSensorAtPosition: (position: [number, number, number]) => void;
  updateSensorAttributePath: (id: string, attributePath: string) => void;
  updateSensorDeviceId: (id: string, deviceId: string) => void;
  removeSensor: (id: string) => void;
  setSensorPosition: (id: string, position: [number, number, number]) => void;
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
  const [history, setHistory] = useState<SensorHistory>({});

  // Track whether we have already loaded persisted configs so we don't
  // accidentally overwrite them with the initial empty state on the first save.
  const configLoadedRef = useRef(false);
  const sensorsRef = useRef<Sensor[]>(sensors);
  useEffect(() => { sensorsRef.current = sensors; }, [sensors]);

  // Carga el historial desde DynamoDB; si falla (sin red) usa el caché local.
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await fetch("/api/sensors/history?deviceId=all", { cache: "no-store" });
        if (!res.ok) throw new Error("api error");

        const data = (await res.json()) as { items?: Record<string, unknown>[] };
        const items = data.items ?? [];

        // Agrupa lecturas por sensorId basándose en deviceId + attributePath de los sensores configurados.
        const fromApi: SensorHistory = {};
        const currentSensors = sensorsRef.current;

        for (const item of items) {
          const deviceId = typeof item.deviceId === "string" ? item.deviceId : null;
          const ts = typeof item.timestamp === "number" ? item.timestamp : null;
          if (!deviceId || ts === null) continue;

          for (const sensor of currentSensors) {
            if (sensor.deviceId !== deviceId) continue;
            const path = sensor.attributePath.trim().length > 0 ? sensor.attributePath : "sensorValue";
            const raw = path.split(".").reduce<unknown>((cur, seg) => {
              if (!cur || typeof cur !== "object") return undefined;
              return (cur as Record<string, unknown>)[seg];
            }, item);
            const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : null;
            if (value === null || !Number.isFinite(value)) continue;

            const existing = fromApi[sensor.id] ?? [];
            fromApi[sensor.id] = [...existing, { timestamp: ts > 1e12 ? ts : ts * 1000, value }]
              .slice(-MAX_HISTORY_POINTS);
          }
        }

        if (Object.keys(fromApi).length > 0) {
          setHistory(fromApi);
          saveSensorHistory(fromApi);
        } else {
          setHistory(loadSensorHistory());
        }
      } catch {
        setHistory(loadSensorHistory());
      }
    };

    loadHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persiste el historial cada vez que cambia.
  useEffect(() => {
    if (Object.keys(history).length === 0) return;
    saveSensorHistory(history);
  }, [history]);

  // Load persisted sensor configs from localStorage after mount (client only).
  useEffect(() => {
    const stored = loadSensorConfigs();
    if (stored && stored.length > 0) {
      setSensors(
        stored.map((cfg) => ({
          ...cfg,
          value: 0,
          baseValue: 0,
          status: "idle" as const,
          updatedAt: new Date(),
        })),
      );
    }
    configLoadedRef.current = true;
  }, []);

  // Persist sensor configs whenever they change (skip before initial load).
  useEffect(() => {
    if (!configLoadedRef.current) return;
    saveSensorConfigs(sensors);
  }, [sensors]);

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

        const nowTs = Date.now();
        const currentSensors = sensorsRef.current;

        setSensors(
          currentSensors.map((sensor) => {
            const telemetry = latestByDeviceId.get(sensor.deviceId);
            if (!telemetry) return { ...sensor, status: "idle" };

            const rawTimestamp = telemetry.timestamp ?? telemetry.msgTimestamp ?? telemetry.updatedAt;
            const updatedAt = toDate(rawTimestamp);
            const path = sensor.attributePath.trim().length > 0 ? sensor.attributePath : "sensorValue";
            const value = getTelemetryNumber(telemetry, path);

            if (value === null) return { ...sensor, value: 0, baseValue: 0, status: "idle" };

            return { ...sensor, value, baseValue: value, updatedAt, status: getSensorStatus(value, true) };
          }),
        );

        setHistory((prevHistory) => {
          const next: SensorHistory = { ...prevHistory };
          for (const sensor of currentSensors) {
            const telemetry = latestByDeviceId.get(sensor.deviceId);
            if (!telemetry) continue;
            const path = sensor.attributePath.trim().length > 0 ? sensor.attributePath : "sensorValue";
            const value = getTelemetryNumber(telemetry, path);
            if (value === null) continue;

            const existing = next[sensor.id] ?? [];
            next[sensor.id] = [...existing, { timestamp: nowTs, value }].slice(-MAX_HISTORY_POINTS);
          }
          return next;
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

  const updateSensorDeviceId = useCallback((id: string, deviceId: string) => {
    setSensors((prev) =>
      prev.map((sensor) =>
        sensor.id === id
          ? {
              ...sensor,
              deviceId,
              status: "idle",
            }
          : sensor,
      ),
    );
  }, []);

  const removeSensor = useCallback((id: string) => {
    setSensors((prev) => prev.filter((sensor) => sensor.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

  const setSensorPosition = useCallback((id: string, position: [number, number, number]) => {
    setSensors((prev) =>
      prev.map((sensor) => {
        if (sensor.id !== id) return sensor;

        return {
          ...sensor,
          position: [
            parseFloat(position[0].toFixed(8)),
            parseFloat(position[1].toFixed(8)),
            parseFloat(position[2].toFixed(8)),
          ],
        };
      }),
    );
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
          nextPosition[axisIndex] = parseFloat(value.toFixed(8));

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
        deviceIds: Object.keys(deviceChannelPaths).sort((left, right) => left.localeCompare(right)),
        selectedId,
        isPlacingSensor,
        history,
        select,
        startPlacingSensor,
        cancelPlacingSensor,
        addSensorAtPosition,
        updateSensorAttributePath,
        updateSensorDeviceId,
        removeSensor,
        setSensorPosition,
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
