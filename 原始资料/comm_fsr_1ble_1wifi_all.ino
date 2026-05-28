/*
 * ============================================================================
 * 跳蛋振动控制器 - BLE + FSR 融合控制 (3.3.6 简化通知版)
 * ============================================================================
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ================= 硬件配置 =================
#define MOTOR_PIN         4
#define LED_PIN           2
#define FSR_PIN           1

// ================= FSR 阈值 =================
#define PRESSURE_L0 500
#define PRESSURE_L1 1500
#define PRESSURE_L2 3000
#define PRESSURE_L3 4000
#define EMA_ALPHA 0.3f

// ================= 振动参数 =================
#define PWM_FREQ          5000
#define PWM_RES           8
#define DUTY_OFF          0
#define DUTY_LOW          150
#define DUTY_MED          200
#define DUTY_HIGH         255

// ================= BLE =================
#define DEVICE_NAME           "Vibration_Egg3"   // 与 Web 端一致
#define SERVICE_UUID          "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define WRITE_CHAR_UUID       "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define NOTIFY_CHAR_UUID      "cde5483e-36e1-4688-b7f5-ea07361b26a8"

#define DISCONNECT_LOCKOUT_MS  600
#define NOTIFY_INTERVAL_MS     200

// ================= 全局变量 =================
float filteredPressure = 0.0;
volatile uint8_t fsrLevel = 3;
volatile uint8_t currentLevel = 3;
volatile uint8_t bleRequestedLevel = 3;

BLEServer* pServer = nullptr;
BLECharacteristic* pWriteChar = nullptr;
BLECharacteristic* pNotifyChar = nullptr;

volatile bool deviceConnected = false;
volatile bool disconnectLockout = false;
volatile unsigned long disconnectTime = 0;

// ================= 振动控制 =================
void setVibration(uint8_t level) {
  uint32_t duty;
  switch (level) {
    case 3: duty = DUTY_OFF;  break;
    case 2: duty = DUTY_LOW;  break;
    case 1: duty = DUTY_MED;  break;
    case 0: duty = DUTY_HIGH; break;
    default: return;
  }
  currentLevel = level;
  ledcWrite(MOTOR_PIN, duty);
  digitalWrite(LED_PIN, (level < 3) ? HIGH : LOW);
}

void forceStopMotor() {
  ledcWrite(MOTOR_PIN, DUTY_OFF);
  currentLevel = 3;
  bleRequestedLevel = 3;
  digitalWrite(LED_PIN, LOW);
}

uint8_t mapPressureToLevel(float value) {
  if (value <= PRESSURE_L0) return 0;
  if (value <= PRESSURE_L1) return 1;
  if (value <= PRESSURE_L2) return 2;
  return 3;
}

void applyFusion() {
  if (disconnectLockout) {
    if (millis() - disconnectTime >= DISCONNECT_LOCKOUT_MS) {
      disconnectLockout = false;
    } else return;
  }
  uint8_t finalLevel = (bleRequestedLevel < fsrLevel) ? bleRequestedLevel : fsrLevel;
  if (finalLevel != currentLevel) setVibration(finalLevel);
}

// ================= 发送传感器数据（无需检查订阅）=================
void sendSensorData() {
  if (!deviceConnected) return;  // 仅检查是否连接

  char payload[128];
  snprintf(payload, sizeof(payload),
           "{\"fsr\":%.0f,\"fsrLevel\":%d,\"motorLevel\":%d}",
           filteredPressure, fsrLevel, currentLevel);
  pNotifyChar->setValue(payload);
  pNotifyChar->notify();  // 3.3.6 库中，无订阅时底层会自动忽略

  static int cnt = 0;
  cnt++;
  if (cnt % 10 == 0) {
    Serial.printf("[NOTIFY] 已发送 %d 次: %s\n", cnt, payload);
  }
}

// ================= 写特性回调 =================
class WriteCallback : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pChar) override {
    String val = pChar->getValue();
    if (val.length() == 0) return;
    uint8_t cmd = val[0];
    if (cmd >= '0' && cmd <= '3') cmd -= '0';
    if (cmd > 3) return;
    Serial.printf("← BLE指令: %d\n", cmd);
    bleRequestedLevel = cmd;
    applyFusion();
  }
};

// ================= 服务器回调 =================
class ServerCallback : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) override {
    deviceConnected = true;
    disconnectLockout = false;
    Serial.println("[BLE] 已连接");
  }
  void onDisconnect(BLEServer* pServer) override {
    deviceConnected = false;
    if (pNotifyChar) pNotifyChar->setValue("");
    forceStopMotor();
    disconnectLockout = true;
    disconnectTime = millis();
    Serial.println("[BLE] 断开");
    BLEDevice::startAdvertising();
  }
};

// ================= 初始化 =================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n========================================");
  Serial.println(" 跳蛋振动控制器 v12 (3.3.6 简化通知)");
  Serial.println("========================================\n");

  pinMode(LED_PIN, OUTPUT);
  pinMode(FSR_PIN, INPUT);
  ledcAttach(MOTOR_PIN, PWM_FREQ, PWM_RES);
  ledcWrite(MOTOR_PIN, DUTY_OFF);

  ledcWrite(MOTOR_PIN, DUTY_HIGH);
  delay(2000);
  ledcWrite(MOTOR_PIN, DUTY_OFF);

  BLEDevice::init(DEVICE_NAME);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallback());

  BLEService* pService = pServer->createService(SERVICE_UUID);

  pWriteChar = pService->createCharacteristic(
    WRITE_CHAR_UUID,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  pWriteChar->setCallbacks(new WriteCallback());

  pNotifyChar = pService->createCharacteristic(
    NOTIFY_CHAR_UUID,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pNotifyChar->addDescriptor(new BLE2902());  // 必须保留

  pService->start();

  BLEAdvertising* pAdv = BLEDevice::getAdvertising();
  pAdv->addServiceUUID(SERVICE_UUID);
  BLEDevice::startAdvertising();

  Serial.printf("[BLE] 设备名：%s\n", DEVICE_NAME);
  Serial.println("[系统] 就绪\n");
}

void loop() {
  uint16_t rawPressure = analogRead(FSR_PIN);
  filteredPressure = EMA_ALPHA * rawPressure + (1 - EMA_ALPHA) * filteredPressure;
  fsrLevel = mapPressureToLevel(filteredPressure);

  applyFusion();

  static unsigned long lastNotify = 0;
  if (millis() - lastNotify >= NOTIFY_INTERVAL_MS) {
    lastNotify = millis();
    sendSensorData();
  }

  static unsigned long lastDebug = 0;
  if (millis() - lastDebug >= 3000) {
    lastDebug = millis();
    Serial.printf("[状态] conn:%d FSR:%.0f lvl:%d\n",
                  deviceConnected, filteredPressure, currentLevel);
  }

  delay(50);
}
