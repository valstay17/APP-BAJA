import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { NextResponse } from "next/server";
import { ddbDocClient } from "@/lib/aws/dynamodb";

const tableName = process.env.SENSORS_TABLE_NAME;
const defaultDeviceId = process.env.DEFAULT_DEVICE_ID ?? "ESP32";
const layoutDeviceId = "__sensor_layout__";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toComparableTimestamp(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value > 1e12 ? value : value * 1000;
}

function getItemTimestamp(item: Record<string, unknown>): number {
  return toComparableTimestamp(item.timestamp ?? item.msgTimestamp ?? item.updatedAt);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedDeviceId = searchParams.get("deviceId");
  const deviceId = requestedDeviceId ?? defaultDeviceId;

  if (!tableName) {
    return NextResponse.json(
      { error: "Missing SENSORS_TABLE_NAME environment variable." },
      { status: 500 },
    );
  }

  try {
    if (!requestedDeviceId || requestedDeviceId === "all") {
      const latestByDevice = new Map<string, Record<string, unknown>>();
      let exclusiveStartKey: Record<string, unknown> | undefined;

      do {
        const response = await ddbDocClient.send(
          new ScanCommand({
            TableName: tableName,
            ExclusiveStartKey: exclusiveStartKey,
          }),
        );

        for (const rawItem of response.Items ?? []) {
          const item = rawItem as Record<string, unknown>;
          if (item.recordType === "layout" || item.deviceId === layoutDeviceId) continue;
          const currentDeviceId = item.deviceId;
          if (typeof currentDeviceId !== "string" || currentDeviceId.trim().length === 0) continue;

          const previous = latestByDevice.get(currentDeviceId);
          if (!previous || getItemTimestamp(item) >= getItemTimestamp(previous)) {
            latestByDevice.set(currentDeviceId, item);
          }
        }

        exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
      } while (exclusiveStartKey);

      return NextResponse.json(
        { items: [...latestByDevice.values()] },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const response = await ddbDocClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "deviceId = :deviceId",
        ExpressionAttributeValues: {
          ":deviceId": deviceId,
        },
        ScanIndexForward: false,
        Limit: 1,
      }),
    );

    const item = response.Items?.[0];

    if (!item) {
      return NextResponse.json(
        { error: `No sensor data found for deviceId '${deviceId}'.` },
        { status: 404 },
      );
    }

    return NextResponse.json(item, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
