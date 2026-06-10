export type SensorStatus = "active" | "idle" | "warning" | "error";

export type Sensor = {
  id: string;
  deviceId: string;
  attributePath: string;
  name: string;
  zone: string;
  unit: string;
  value: number;
  baseValue: number;
  status: SensorStatus;
  updatedAt: Date;
  /** Posición 3D del hotspot sobre el modelo [x, y, z] */
  position: [number, number, number];
};

export type SensorLayout = Pick<
  Sensor,
  "id" | "deviceId" | "attributePath" | "name" | "zone" | "unit" | "position"
>;

export const STATUS_CFG: Record<
  SensorStatus,
  { label: string; color: string; dot: string; border: string; bg: string; text: string }
> = {
  active: {
    label: "Activo",
    color: "#10b981",
    dot: "bg-emerald-500",
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
  },
  idle: {
    label: "Inactivo",
    color: "#94a3b8",
    dot: "bg-slate-300",
    border: "border-slate-200",
    bg: "bg-slate-50",
    text: "text-slate-500",
  },
  warning: {
    label: "Alerta",
    color: "#f59e0b",
    dot: "bg-amber-400",
    border: "border-amber-200",
    bg: "bg-amber-50",
    text: "text-amber-700",
  },
  error: {
    label: "Error",
    color: "#ef4444",
    dot: "bg-red-500",
    border: "border-red-200",
    bg: "bg-red-50",
    text: "text-red-700",
  },
};

export const INITIAL_SENSORS: Sensor[] = [
];

export function vary(base: number, pct = 0.04): number {
  return parseFloat((base * (1 + (Math.random() - 0.5) * pct * 2)).toFixed(2));
}
