import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { NextResponse } from "next/server";
import { ddbDocClient } from "@/lib/aws/dynamodb";
import { type SensorLayout } from "@/lib/sensors/sensor-types";

const tableName = process.env.SENSORS_TABLE_NAME;
const layoutDeviceId = "__sensor_layout__";
const layoutRecordType = "layout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LayoutItem = {
  sensors?: unknown;
};

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

export async function GET() {
  if (!tableName) {
    return NextResponse.json(
      { error: "Missing SENSORS_TABLE_NAME environment variable." },
      { status: 500 },
    );
  }

  try {
    const response = await ddbDocClient.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          deviceId: layoutDeviceId,
          recordType: layoutRecordType,
        },
      }),
    );

    const item = response.Item as LayoutItem | undefined;
    const sensors = normalizeLayoutList(item?.sensors);

    return NextResponse.json(
      { sensors },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!tableName) {
    return NextResponse.json(
      { error: "Missing SENSORS_TABLE_NAME environment variable." },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as { sensors?: unknown };
    const sensors = normalizeLayoutList(body.sensors);

    await ddbDocClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          deviceId: layoutDeviceId,
          recordType: layoutRecordType,
          sensors,
          updatedAt: new Date().toISOString(),
        },
      }),
    );

    return NextResponse.json(
      { sensors },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
