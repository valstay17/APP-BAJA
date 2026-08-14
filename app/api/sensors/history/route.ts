import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { NextResponse } from "next/server";
import { ddbDocClient } from "@/lib/aws/dynamodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const historyTable = process.env.SENSORS_HISTORY_TABLE_NAME;
const defaultDeviceId = process.env.DEFAULT_DEVICE_ID ?? "ESP32";
const DEFAULT_WINDOW_MS = 60 * 60 * 1000; // última hora
const MAX_LIMIT = 500;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  if (!historyTable) {
    return NextResponse.json(
      { error: "Missing SENSORS_HISTORY_TABLE_NAME environment variable." },
      { status: 500 },
    );
  }

  const deviceId = searchParams.get("deviceId") ?? defaultDeviceId;
  const now = Date.now();
  const from = Number(searchParams.get("from") ?? now - DEFAULT_WINDOW_MS);
  const to = Number(searchParams.get("to") ?? now);
  const limit = Math.min(Number(searchParams.get("limit") ?? 200), MAX_LIMIT);

  // "all" devuelve la última hora de todos los devices conocidos — hace una query por device.
  // Para un primer uso sin conocer los deviceIds, hace un scan reducido.
  if (deviceId === "all") {
    try {
      const { ScanCommand } = await import("@aws-sdk/lib-dynamodb");
      const scan = await ddbDocClient.send(
        new ScanCommand({
          TableName: historyTable,
          FilterExpression: "#ts BETWEEN :from AND :to",
          ExpressionAttributeNames: { "#ts": "timestamp" },
          ExpressionAttributeValues: { ":from": from, ":to": to },
          Limit: MAX_LIMIT,
        }),
      );
      return NextResponse.json(
        { items: scan.Items ?? [] },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  try {
    const response = await ddbDocClient.send(
      new QueryCommand({
        TableName: historyTable,
        KeyConditionExpression: "deviceId = :deviceId AND #ts BETWEEN :from AND :to",
        ExpressionAttributeNames: { "#ts": "timestamp" },
        ExpressionAttributeValues: {
          ":deviceId": deviceId,
          ":from": from,
          ":to": to,
        },
        ScanIndexForward: true,
        Limit: limit,
      }),
    );

    return NextResponse.json(
      { items: response.Items ?? [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
