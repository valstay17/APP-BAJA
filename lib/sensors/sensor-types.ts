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

// Coordenadas de ejemplo ya "pintadas" sobre el chasis. Ajusta position con
// los puntos reales que captures usando el modo alta en el visor 3D.
// deviceId/attributePath se dejan vacíos: se asignan después desde el panel,
// vinculando cada punto fijo con el registro real de la base de datos.
export const INITIAL_SENSORS: Sensor[] = [
  {
    id: "s1",
    deviceId: "",
    attributePath: "",
    name: "Punto delantero izquierdo 1",
    zone: "Chasis frontal",
    unit: "u",
    value: 0,
    baseValue: 0,
    status: "idle",
    updatedAt: new Date(),
    position: [0.1372614922, -0.7370595204, -0.2028638001],
  },
  {
    id: "s2",
    deviceId: "",
    attributePath: "",
    name: "Punto delantero derecho 1",
    zone: "Chasis frontal",
    unit: "u",
    value: 0,
    baseValue: 0,
    status: "idle",
    updatedAt: new Date(),
    position: [0.1972476251, -1.0813861216, -0.2022596823],
  },
  {
    id: "s3",
    deviceId: "",
    attributePath: "",
    name: "Punto delantero izquierdo 2",
    zone: "Chasis frontal",
    unit: "u",
    value: 0,
    baseValue: 0,
    status: "idle",
    updatedAt: new Date(),
    position: [0.06337016722, -1.0820741977, -0.204635417512],
  },
  {
    id: "s4",
    deviceId: "",
    attributePath: "",
    name: "Punto delantero derecho 2",
    zone: "Chasis frontal",
    unit: "u",
    value: 0,
    baseValue: 0,
    status: "idle",
    updatedAt: new Date(),
    position: [-0.0045200903, -0.6903298361, -0.2056342087 ],
  },
  {
    id: "s5",
    deviceId: "",
    attributePath: "",
    name: "Punto delantero derecho 3",
    zone: "Chasis frontal",
    unit: "u",
    value: 0,
    baseValue: 0,
    status: "idle",
    updatedAt: new Date(),
    position: [0.0001598022, -0.6955397732, 0.1787513431],
  },
  {
    id: "s6",
    deviceId: "",
    attributePath: "",
    name: "Punto delantero izquierdo 3",
    zone: "Chasis frontal",
    unit: "u",
    value: 0,
    baseValue: 0,
    status: "idle",
    updatedAt: new Date(),
    position: [0.1392749397, -0.7393873045, 0.1825604399],
  },
  {
    id: "s7",
    deviceId: "",
    attributePath: "",
    name: "Punto delantero izquierdo 4",
    zone: "Chasis frontal",
    unit: "u",
    value: 0,
    baseValue: 0,
    status: "idle",
    updatedAt: new Date(),
    position: [0.0668707942, -1.0663523517, 0.1782590966],
  },
  {
    id: "s8",
    deviceId: "",
    attributePath: "",
    name: "Punto delantero derecho 4",
    zone: "Chasis frontal",
    unit: "u",
    value: 0,
    baseValue: 0,
    status: "idle",
    updatedAt: new Date(),
    position: [0.2092518471, -1.0818227569, 0.1809311825],
  },
];

export function vary(base: number, pct = 0.04): number {
  return parseFloat((base * (1 + (Math.random() - 0.5) * pct * 2)).toFixed(2));
}
