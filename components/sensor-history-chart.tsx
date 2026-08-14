"use client";

import { useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useSensors } from "@/components/providers/sensor-provider";
import { exportSensorReportPdf } from "@/lib/sensors/pdf-export";

const LINE_COLORS = [
  "#0891b2",
  "#f59e0b",
  "#ef4444",
  "#10b981",
  "#6366f1",
  "#ec4899",
  "#84cc16",
  "#8b5cf6",
  "#f59d9d",
  "#f97316",
  "#3b82f6",
  "#10b981",
  "#4a2d90",
  "#640e0e",
  "#984e19",
  "#113b80",
  "#086b4a",
  "#728fbd",
  "#9df4d7",
  "#f89bc9",
  "#fcd693"
];

export function SensorHistoryChart() {
  const { sensors, history } = useSensors();
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const chartData = useMemo(() => {
    const timestamps = new Set<number>();
    for (const sensor of sensors) {
      for (const reading of history[sensor.id] ?? []) {
        timestamps.add(reading.timestamp);
      }
    }

    const sortedTimestamps = [...timestamps].sort((a, b) => a - b);

    return sortedTimestamps.map((timestamp) => {
      const point: Record<string, number | string> = {
        time: new Date(timestamp).toLocaleTimeString("es-MX", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      };
      for (const sensor of sensors) {
        const reading = (history[sensor.id] ?? []).find((r) => r.timestamp === timestamp);
        if (reading) point[sensor.id] = reading.value;
      }
      return point;
    });
  }, [history, sensors]);

  const handleExport = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      await exportSensorReportPdf(reportRef.current, sensors, history);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex h-dvh flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[0.72rem] font-medium uppercase tracking-[0.3em] text-slate-500">
            Historial de sensores
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {chartData.length} lecturas registradas · {sensors.length} sensores
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExporting ? "Generando..." : "Exportar PDF"}
          </button>
        </div>
      </div>

      <div ref={reportRef} className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-800">Todos los sensores</p>
        <p className="text-xs text-slate-400">Valor por sensor a lo largo del tiempo</p>

        <div className="mt-3 h-150 w-full">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">
              Aún no hay lecturas registradas.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} minTickGap={24} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {sensors.map((sensor, index) => (
                  <Line
                    key={sensor.id}
                    type="monotone"
                    dataKey={sensor.id}
                    name={sensor.name}
                    stroke={LINE_COLORS[index % LINE_COLORS.length]}
                    dot={false}
                    strokeWidth={2}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
