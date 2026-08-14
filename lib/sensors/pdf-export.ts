import type { Sensor } from "@/lib/sensors/sensor-types";
import type { SensorHistory } from "@/components/providers/sensor-provider";

export async function exportSensorReportPdf(
  chartElement: HTMLElement,
  sensors: Sensor[],
  history: SensorHistory,
): Promise<void> {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas-pro"),
  ]);

  const canvas = await html2canvas(chartElement, { backgroundColor: "#ffffff", scale: 2 });
  const chartImage = canvas.toDataURL("image/png");

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  doc.setFontSize(16);
  doc.text("Reporte de monitoreo de sensores", margin, 50);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Generado: ${new Date().toLocaleString("es-MX")}`, margin, 68);

  const imageWidth = pageWidth - margin * 2;
  const imageHeight = (canvas.height / canvas.width) * imageWidth;
  doc.addImage(chartImage, "PNG", margin, 90, imageWidth, imageHeight);

  let cursorY = 90 + imageHeight + 30;
  doc.setTextColor(20);
  doc.setFontSize(12);
  doc.text("Estado actual de sensores", margin, cursorY);
  cursorY += 18;

  doc.setFontSize(9);
  for (const sensor of sensors) {
    if (cursorY > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      cursorY = margin;
    }
    const readingsCount = history[sensor.id]?.length ?? 0;
    doc.text(
      `${sensor.name} (${sensor.zone}) — valor: ${sensor.value} ${sensor.unit} — estado: ${sensor.status} — lecturas: ${readingsCount}`,
      margin,
      cursorY,
    );
    cursorY += 14;
  }

  doc.save(`reporte-sensores-${Date.now()}.pdf`);
}
