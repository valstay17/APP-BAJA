+"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { type Sensor, INITIAL_SENSORS, vary } from "@/lib/sensors/sensor-types";

type SensorCtx = {
  sensors: Sensor[];
  selectedId: string | null;
  isPlacingSensor: boolean;
  select: (id: string | null) => void;
  startPlacingSensor: () => void;
  cancelPlacingSensor: () => void;
  addSensorAtPosition: (position: [number, number, number]) => void;
  removeSensor: (id: string) => void;
  updateSensorPosition: (id: string, axis: "x" | "y" | "z", value: number) => void;
};

const SensorContext = createContext<SensorCtx | null>(null);

export function SensorProvider({ children }: { children: ReactNode }) {
  const [sensors, setSensors] = useState<Sensor[]>(INITIAL_SENSORS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPlacingSensor, setIsPlacingSensor] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setSensors((prev) =>
        prev.map((s) =>
          s.status === "idle" || s.status === "error"
            ? { ...s, updatedAt: new Date() }
            : { ...s, value: vary(s.baseValue), updatedAt: new Date() },
        ),
      );
    }, 1800);
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
      const newSensor: Sensor = {
        id: `s${nextIndex}`,
        name: `Nuevo sensor ${nextIndex}`,
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
        selectedId,
        isPlacingSensor,
        select,
        startPlacingSensor,
        cancelPlacingSensor,
        addSensorAtPosition,
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
