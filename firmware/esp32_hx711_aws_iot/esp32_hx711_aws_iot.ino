#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <time.h>
#include <LittleFS.h>
#include "HX711.h"

const char* WIFI_SSID = "TU_WIFI";
const char* WIFI_PASS = "TU_PASSWORD";

const char* AWS_IOT_ENDPOINT = "apnrlecc8bdx8-ats.iot.us-east-1.amazonaws.com";
const int AWS_IOT_PORT = 8883;

const char* CLIENT_ID = "ESP32";
const char* TOPIC_PUB = "sensores/baja/ESP32/telemetry";
const char* TOPIC_SUB = "sensores/baja/ESP32/cmd";

const int HX711_COUNT = 4;
const int HX711_DOUT_PINS[HX711_COUNT] = {34, 35, 32, 33};
const int HX711_SCK_PIN = 25;

// Ajusta cada factor con calibracion real. Si los 4 puentes son iguales, puedes empezar con el mismo valor.
const float CALIBRATION_FACTORS[HX711_COUNT] = {
  -7050.0f,
  -7050.0f,
  -7050.0f,
  -7050.0f
};

static const char AWS_ROOT_CA[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
-----END CERTIFICATE-----
)EOF";

static const char AWS_DEVICE_CERT[] PROGMEM = R"KEY(
-----BEGIN CERTIFICATE-----
-----END CERTIFICATE-----
)KEY";

static const char AWS_PRIVATE_KEY[] PROGMEM = R"KEY(
-----BEGIN RSA PRIVATE KEY-----
-----END RSA PRIVATE KEY-----
)KEY";

static const char* QUEUE_FILE = "/queue.txt";
static const char* QUEUE_TMP_FILE = "/queue.tmp";

WiFiClientSecure net;
PubSubClient mqtt(net);
HX711 scales[HX711_COUNT];

unsigned long lastMqttAttempt = 0;
unsigned long lastPublish = 0;
bool timeSynced = false;
bool tlsReady = false;

long zeroOffsets[HX711_COUNT] = {0, 0, 0, 0};

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Topic recibido: ");
  Serial.println(topic);

  char message[256];
  unsigned int copyLen = length < sizeof(message) - 1 ? length : sizeof(message) - 1;
  memcpy(message, payload, copyLen);
  message[copyLen] = '\0';

  Serial.print("Payload: ");
  Serial.println(message);

  if (strcmp(topic, TOPIC_SUB) == 0 && strcmp(message, "{\"cmd\":\"ping\"}") == 0) {
    mqtt.publish(TOPIC_PUB, "{\"deviceId\":\"ESP32\",\"status\":\"pong\"}");
  }
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.print("Conectando WiFi");
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 30000) {
    delay(300);
    Serial.print(".");
    yield();
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi conectado. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi no conectado");
  }
}

bool syncTimeNonBlocking() {
  static bool started = false;
  static unsigned long startMs = 0;
  static unsigned long retryAt = 0;

  time_t now = time(nullptr);
  if (now > 100000) {
    started = false;
    startMs = 0;
    retryAt = 0;
    return true;
  }

  if (millis() < retryAt) {
    return false;
  }

  if (!started) {
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    started = true;
    startMs = millis();
    Serial.println("Esperando hora NTP...");
  }

  now = time(nullptr);
  if (now > 100000) {
    started = false;
    startMs = 0;
    retryAt = 0;
    return true;
  }

  if (millis() - startMs > 30000) {
    Serial.println("NTP timeout");
    started = false;
    startMs = 0;
    retryAt = millis() + 10000;
  }

  return false;
}

bool ensureStorage() {
  return LittleFS.begin(true);
}

void prepareNetClient() {
  net.stop();
  net.setCACert(AWS_ROOT_CA);
  net.setCertificate(AWS_DEVICE_CERT);
  net.setPrivateKey(AWS_PRIVATE_KEY);
  net.setHandshakeTimeout(20);
  net.setTimeout(8000);
}

bool testTLS() {
  WiFiClientSecure probe;
  probe.setCACert(AWS_ROOT_CA);
  probe.setCertificate(AWS_DEVICE_CERT);
  probe.setPrivateKey(AWS_PRIVATE_KEY);
  probe.setHandshakeTimeout(20);
  probe.setTimeout(8000);

  Serial.println("TLS precheck...");
  bool ok = probe.connect(AWS_IOT_ENDPOINT, AWS_IOT_PORT);

  if (!ok) {
    char err[128] = {0};
    int code = probe.lastError(err, sizeof(err));
    Serial.printf("TLS FAIL code=%d msg=%s\n", code, err);
    probe.stop();
    return false;
  }

  Serial.println("TLS OK");
  probe.stop();
  return true;
}

void initScales() {
  for (int i = 0; i < HX711_COUNT; i++) {
    scales[i].begin(HX711_DOUT_PINS[i], HX711_SCK_PIN);
    scales[i].set_scale(CALIBRATION_FACTORS[i]);
    scales[i].tare(20);
    zeroOffsets[i] = scales[i].read_average(10);

    Serial.print("HX711 ");
    Serial.print(i + 1);
    Serial.print(" zeroOffset: ");
    Serial.println(zeroOffsets[i]);
  }
}

float readDeformationUnits(int index) {
  return scales[index].get_units(10);
}

long readRawDelta(int index) {
  return scales[index].read_average(5) - zeroOffsets[index];
}

String buildTelemetryJson(const float deformation[HX711_COUNT], const long rawDelta[HX711_COUNT], int rssi, time_t nowEpoch) {
  char payload[512];
  snprintf(
    payload,
    sizeof(payload),
    "{\"deviceId\":\"ESP32\",\"sensorType\":\"hx711_strain\",\"channels\":["
    "{\"id\":1,\"deformation\":%.4f,\"rawDelta\":%ld},"
    "{\"id\":2,\"deformation\":%.4f,\"rawDelta\":%ld},"
    "{\"id\":3,\"deformation\":%.4f,\"rawDelta\":%ld},"
    "{\"id\":4,\"deformation\":%.4f,\"rawDelta\":%ld}],"
    "\"rssi\":%d,\"timestamp\":%lu}",
    deformation[0], rawDelta[0],
    deformation[1], rawDelta[1],
    deformation[2], rawDelta[2],
    deformation[3], rawDelta[3],
    rssi,
    (unsigned long)nowEpoch
  );
  return String(payload);
}

bool appendOfflineRecord(const String& json) {
  if (!ensureStorage()) return false;

  File file = LittleFS.open(QUEUE_FILE, FILE_APPEND);
  if (!file) {
    Serial.println("No se pudo abrir la cola local");
    return false;
  }

  file.println(json);
  file.close();
  Serial.println("Registro guardado localmente");
  return true;
}

void flushOfflineQueue() {
  if (!mqtt.connected()) return;
  if (!LittleFS.exists(QUEUE_FILE)) return;

  File input = LittleFS.open(QUEUE_FILE, FILE_READ);
  if (!input) {
    Serial.println("No se pudo leer la cola local");
    return;
  }

  File output = LittleFS.open(QUEUE_TMP_FILE, FILE_WRITE);
  if (!output) {
    input.close();
    Serial.println("No se pudo preparar archivo temporal");
    return;
  }

  bool keepCopying = false;
  while (input.available()) {
    String line = input.readStringUntil('\n');
    line.trim();
    if (!line.length()) continue;

    if (!keepCopying && mqtt.publish(TOPIC_PUB, line.c_str())) {
      Serial.println("Reenviado registro local");
      continue;
    }

    keepCopying = true;
    output.println(line);
  }

  input.close();
  output.close();

  LittleFS.remove(QUEUE_FILE);
  if (LittleFS.exists(QUEUE_TMP_FILE)) {
    LittleFS.rename(QUEUE_TMP_FILE, QUEUE_FILE);
  }
}

void tryConnectMQTT() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (!timeSynced) return;
  if (!tlsReady) return;
  if (mqtt.connected()) return;
  if (millis() - lastMqttAttempt < 5000) return;

  lastMqttAttempt = millis();

  IPAddress ip;
  if (!WiFi.hostByName(AWS_IOT_ENDPOINT, ip)) {
    Serial.println("DNS FAIL");
    return;
  }

  Serial.printf("WiFi RSSI=%d dBm\n", WiFi.RSSI());
  Serial.print("DNS OK -> ");
  Serial.println(ip);

  prepareNetClient();

  Serial.println("Intentando MQTT...");
  unsigned long t0 = millis();
  bool ok = mqtt.connect(CLIENT_ID);
  unsigned long dt = millis() - t0;

  Serial.print("mqtt.connect=");
  Serial.print(ok ? "true" : "false");
  Serial.print(" state=");
  Serial.print(mqtt.state());
  Serial.print(" elapsed_ms=");
  Serial.print(dt);
  Serial.print(" heap=");
  Serial.println(ESP.getFreeHeap());

  if (ok) {
    Serial.println("MQTT OK");
    mqtt.subscribe(TOPIC_SUB);
    mqtt.publish(TOPIC_PUB, "{\"deviceId\":\"ESP32\",\"status\":\"online\"}");
    flushOfflineQueue();
  }
}

void publishTelemetry() {
  if (!mqtt.connected()) return;
  if (millis() - lastPublish < 5000) return;

  lastPublish = millis();

  float deformation[HX711_COUNT];
  long rawDelta[HX711_COUNT];

  for (int i = 0; i < HX711_COUNT; i++) {
    deformation[i] = readDeformationUnits(i);
    rawDelta[i] = readRawDelta(i);
  }

  int rssi = WiFi.RSSI();
  time_t now = time(nullptr);

  String payload = buildTelemetryJson(deformation, rawDelta, rssi, now);

  Serial.print("Publicando: ");
  Serial.println(payload);

  if (!mqtt.publish(TOPIC_PUB, payload.c_str())) {
    appendOfflineRecord(payload);
  }
}

void setup() {
  Serial.begin(115200);
  delay(800);

  if (!ensureStorage()) {
    Serial.println("Aviso: sin LittleFS no habra cola local");
  }

  initScales();

  mqtt.setServer(AWS_IOT_ENDPOINT, AWS_IOT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setSocketTimeout(4);
  mqtt.setKeepAlive(30);

  connectWiFi();

  if (WiFi.status() == WL_CONNECTED) {
    timeSynced = syncTimeNonBlocking();
    if (timeSynced) {
      tlsReady = testTLS();
    }
  }
}

void loop() {
  connectWiFi();

  if (WiFi.status() != WL_CONNECTED) {
    timeSynced = false;
    tlsReady = false;
    delay(10);
    yield();
    return;
  }

  if (!timeSynced) {
    timeSynced = syncTimeNonBlocking();
  }

  if (timeSynced && !tlsReady) {
    tlsReady = testTLS();
  }

  tryConnectMQTT();

  if (mqtt.connected()) {
    mqtt.loop();
    publishTelemetry();
  }

  delay(10);
  yield();
}