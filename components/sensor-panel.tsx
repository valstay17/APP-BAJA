"use client";

import { useEffect, useState } from "react";
import { useSensors } from "@/components/providers/sensor-provider";
import { STATUS_CFG } from "@/lib/sensors/sensor-types";

const SENSORS_PER_PAGE = 4;

export function SensorPanel() {
  const {
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
    updateSensorAttributePath,
    removeSensor,
    updateSensorPosition,
  } = useSensors();
  const [page, setPage] = useState(0);

  const active = sensors.filter((s) => s.status === "active").length;
  const warning = sensors.filter((s) => s.status === "warning").length;
  const error = sensors.filter((s) => s.status === "error").length;
  const totalPages = Math.max(1, Math.ceil(sensors.length / SENSORS_PER_PAGE));
  const currentPage = Math.min(page, totalPages - 1);
  const startIndex = currentPage * SENSORS_PER_PAGE;
  const visibleSensors = sensors.slice(startIndex, startIndex + SENSORS_PER_PAGE);

  useEffect(() => {
    if (page !== currentPage) {
      setPage(currentPage);
    }
  }, [currentPage, page]);

  return (
    <div className="flex h-full flex-col gap-5">
      {/* Encabezado del panel */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[0.72rem] font-medium uppercase tracking-[0.3em] text-slate-500">
            Monitoreo de sensores
          </p>
          <p className="mt-1 text-sm text-slate-400">{sensors.length} sensores configurados</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill color="emerald" count={active} label="activos" />
          {warning > 0 && <Pill color="amber" count={warning} label="alerta" />}
          {error > 0 && <Pill color="red" count={error} label="error" />}
          <button
            type="button"
            onClick={isEditingSensors ? stopEditingSensors : startEditingSensors}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] transition-colors ${
              isEditingSensors
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
            }`}
          >
            {isEditingSensors ? "Bloquear posiciones" : "Editar posiciones"}
          </button>
          <button
            type="button"
            onClick={isPlacingSensor ? cancelPlacingSensor : startPlacingSensor}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] transition-colors ${
              isPlacingSensor
                ? "border-cyan-300 bg-cyan-50 text-cyan-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
            }`}
          >
            {isPlacingSensor ? "Cancelar alta" : "Agregar sensor"}
          </button>
        </div>
      </div>

      {isPlacingSensor && (
        <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
          Haz click sobre el chasis en el visor 3D para colocar un nuevo sensor.
        </div>
      )}

      <div className="flex items-center gap-2 self-start rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-[0.68rem] text-slate-500 shadow-sm">
        <button
          type="button"
          onClick={() => setPage((current) => Math.max(current - 1, 0))}
          disabled={currentPage === 0}
          aria-label="Ver sensores anteriores"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5">
            <path
              d="M12.5 4.5 7 10l5.5 5.5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        </button>

        <div className="leading-tight">
          <p className="font-medium text-slate-700">
            {visibleSensors.length === 0
              ? "Sin sensores"
              : `Sensores ${startIndex + 1}-${startIndex + visibleSensors.length}`}
          </p>
          <p>{isEditingSensors ? `Página ${currentPage + 1} de ${totalPages}` : "Posiciones bloqueadas"}</p>
        </div>

        <button
          type="button"
          onClick={() => setPage((current) => Math.min(current + 1, totalPages - 1))}
          disabled={currentPage >= totalPages - 1}
          aria-label="Ver sensores siguientes"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5">
            <path
              d="m7.5 4.5 5.5 5.5-5.5 5.5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        </button>
      </div>

      {/* Tarjetas de sensores */}
      <div className="flex flex-col gap-3">
        {visibleSensors.map((sensor) => {
          const cfg = STATUS_CFG[sensor.status];
          const open = selectedId === sensor.id;

          return (
            <div
              key={sensor.id}
              role="button"
              tabIndex={0}
              onClick={() => select(sensor.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  select(sensor.id);
                }
              }}
              className={`w-full rounded-2xl border px-4 py-3.5 text-left transition-all duration-200 ${
                open
                  ? "border-slate-300 bg-white shadow-[0_8px_32px_rgba(15,23,42,0.10)]"
                  : "border-slate-200 bg-white/60 hover:border-slate-300 hover:bg-white hover:shadow-[0_6px_20px_rgba(15,23,42,0.07)]"
              }`}
            >
              {/* Fila principal */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{sensor.name}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-400">{sensor.zone}</p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cfg.border} ${cfg.bg} ${cfg.text}`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${cfg.dot} ${
                      sensor.status === "active" ? "animate-pulse" : ""
                    }`}
                  />
                  {cfg.label}
                </span>
              </div>

              {/* Detalle expandido */}
              {open && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-400">
                        Valor actual
                      </p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                        {sensor.value}{" "}
                        <span className="text-sm font-normal text-slate-400">{sensor.unit}</span>
                      </p>
                    </div>
                    <p className="text-[0.65rem] text-slate-300">
                      {sensor.updatedAt.toLocaleTimeString("es-MX", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </p>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <AxisInput
                      label="X"
                      value={sensor.position[0]}
                      disabled={!isEditingSensors}
                      onChange={(nextValue) => updateSensorPosition(sensor.id, "x", nextValue)}
                    />
                    <AxisInput
                      label="Y"
                      value={sensor.position[1]}
                      disabled={!isEditingSensors}
                      onChange={(nextValue) => updateSensorPosition(sensor.id, "y", nextValue)}
                    />
                    <AxisInput
                      label="Z"
                      value={sensor.position[2]}
                      disabled={!isEditingSensors}
                      onChange={(nextValue) => updateSensorPosition(sensor.id, "z", nextValue)}
                    />
                  </div>

                  <div className="mt-3">
                    <AttributeInput
                      value={sensor.attributePath}
                      options={telemetryPaths}
                      onChange={(nextValue) => updateSensorAttributePath(sensor.id, nextValue)}
                    />
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeSensor(sensor.id);
                      }}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-red-700 transition-colors hover:border-red-300 hover:bg-red-100"
                    >
                      Eliminar sensor
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Nota de actualización */}
      <p className="mt-auto text-[0.65rem] text-slate-400">
        Datos simulados · se actualiza cada 1.8 s · alta manual sobre el chasis
      </p>
    </div>
  );
}

function Pill({
  color,
  count,
  label,
}: {
  color: "emerald" | "amber" | "red";
  count: number;
  label: string;
}) {
  const styles = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-red-200 bg-red-50 text-red-700",
  };
  const dots = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-400",
    red: "bg-red-500",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${styles[color]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dots[color]}`} />
      {count} {label}
    </span>
  );
}

function AxisInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: "X" | "Y" | "Z";
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label
      className={`rounded-xl border px-2.5 py-2 text-xs ${
        disabled ? "border-slate-200 bg-slate-100 text-slate-400" : "border-slate-200 bg-slate-50 text-slate-500"
      }`}
    >
      <span className="font-semibold tracking-[0.18em] text-slate-400">{label}</span>
      <input
        type="number"
        step={0.001}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value || 0))}
        onClick={(event) => event.stopPropagation()}
        className="mt-1 w-full border-none bg-transparent p-0 text-sm font-semibold tabular-nums text-slate-700 outline-none disabled:cursor-not-allowed disabled:text-slate-400"
      />
    </label>
  );
}

function AttributeInput({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
      <span className="font-semibold tracking-[0.18em] text-slate-400">ATRIBUTO DYNAMODB</span>
      <input
        type="text"
        value={value}
        list="telemetry-attribute-paths"
        onChange={(event) => onChange(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        placeholder="sensorValue o payload.rssi"
        className="mt-1 w-full border-none bg-transparent p-0 text-sm font-semibold text-slate-700 outline-none"
      />
      <datalist id="telemetry-attribute-paths">
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </label>
  );
}
