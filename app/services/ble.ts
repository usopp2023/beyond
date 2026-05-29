import { Platform, PermissionsAndroid } from 'react-native';
import { BleManager, Device, Subscription } from 'react-native-ble-plx';

export const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
export const WRITE_CHAR_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
export const NOTIFY_CHAR_UUID = 'cde5483e-36e1-4688-b7f5-ea07361b26a8';
export const DEVICE_NAME = 'Vibration_Egg3';

export type Telemetry = {
  fsr?: number;
  fsrLevel?: number;
  motorLevel?: number;
};

let manager: BleManager | null = null;
function getManager() {
  if (!manager) manager = new BleManager();
  return manager;
}

// Module-level store for the currently connected device. Navigation params
// strip non-serializable values (functions, circular refs) so we can't pass
// the ble-plx Device through them.
let activeDevice: Device | null = null;
export function setActiveDevice(d: Device | null) {
  activeDevice = d;
}
export function getActiveDevice(): Device | null {
  return activeDevice;
}

// ─────────────────────────── Simulation mode ───────────────────────────────
// When simMode is true, there is no real BLE connection. subscribeTelemetry
// fakes a 5 Hz Telemetry stream following a canned arousal-like FSR curve,
// and writeLevel just updates a module-local "virtual motor level" that the
// telemetry stream echoes back so the Wave / dial follow naturally.
let simMode = false;
let simMotorLevel: 0 | 1 | 2 | 3 = 3;
let simStartedAt = 0;
export function setSimMode(on: boolean) {
  simMode = on;
  if (on) {
    simStartedAt = Date.now();
    simMotorLevel = 3;
  }
}
export function isSimMode(): boolean {
  return simMode;
}

// Canned FSR curve, t in seconds since sim started. Output: 0..4095.
function simFsr(t: number): number {
  const cycle = t % 60; // loop every 60s so demos can run repeatedly
  if (cycle < 10) {
    // 散乱、低 — bursts up to ~10%
    return Math.random() < 0.3 ? 200 + Math.random() * 250 : Math.random() * 120;
  }
  if (cycle < 30) {
    // 稳定中等 — ~35% with small noise
    return 1400 + Math.random() * 250;
  }
  if (cycle < 50) {
    // 节律 + 攀升 — sin envelope rising from mid to high
    const ramp = (cycle - 30) / 20; // 0..1
    const base = 1500 + ramp * 1500;
    const osc = Math.sin((cycle - 30) * 1.2) * 600;
    return Math.max(0, Math.min(4095, base + osc));
  }
  // 50-60s 回落
  const decay = 1 - (cycle - 50) / 10;
  return Math.max(0, 1800 * decay + Math.random() * 200);
}

export async function requestAndroidPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const apiLevel = Platform.Version as number;
  const perms: string[] =
    apiLevel >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const result = await PermissionsAndroid.requestMultiple(perms as any);
  return Object.values(result).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
}

export function scanForDevice(
  onFound: (device: Device) => void,
  onError?: (err: Error) => void,
): () => void {
  const m = getManager();
  m.startDeviceScan(null, null, (err, device) => {
    if (err) {
      onError?.(err);
      return;
    }
    if (device?.name === DEVICE_NAME) {
      onFound(device);
    }
  });
  return () => m.stopDeviceScan();
}

export async function connectAndPrepare(device: Device): Promise<Device> {
  const m = getManager();
  m.stopDeviceScan();
  let connected = await device.connect();
  // Default ATT MTU is 23 (20 payload bytes) which truncates our ~40-byte
  // telemetry JSON. Negotiate a larger MTU before service discovery.
  try {
    // 100 bytes is plenty for our ~40-byte telemetry JSON yet small enough
    // to avoid stability issues we've seen at higher values.
    connected = await connected.requestMTU(100);
    console.log('[BLE] MTU negotiated → 100');
  } catch (e: any) {
    console.warn('[BLE] requestMTU failed (continuing):', e?.message ?? e);
  }
  await connected.discoverAllServicesAndCharacteristics();
  return connected;
}

export function subscribeTelemetry(
  device: Device | null,
  onData: (t: Telemetry) => void,
  onError?: (err: Error) => void,
): Subscription {
  if (!device && simMode) {
    console.log('[SIM] subscribeTelemetry');
    const handle = setInterval(() => {
      const t = (Date.now() - simStartedAt) / 1000;
      const fsr = Math.round(simFsr(t));
      const fsrLevel = fsr > 2500 ? 0 : fsr > 1200 ? 1 : fsr > 400 ? 2 : 3;
      onData({ fsr, fsrLevel, motorLevel: simMotorLevel });
    }, 200);
    return { remove: () => clearInterval(handle) } as Subscription;
  }
  if (!device) {
    console.warn('[BLE] subscribeTelemetry called with null device & no sim');
    return { remove: () => {} } as Subscription;
  }
  console.log('[BLE] subscribeTelemetry → attaching monitor');
  let pktCnt = 0;
  return device.monitorCharacteristicForService(
    SERVICE_UUID,
    NOTIFY_CHAR_UUID,
    (err, ch) => {
      if (err) {
        console.warn('[BLE] monitor ERR:', err?.message ?? err);
        onError?.(err);
        return;
      }
      if (!ch?.value) {
        console.log('[BLE] monitor cb fired w/ empty value');
        return;
      }
      pktCnt++;
      try {
        const text = (global as any).atob
          ? (global as any).atob(ch.value)
          : '';
        if (pktCnt <= 3 || pktCnt % 10 === 0) {
          console.log(`[BLE] notify #${pktCnt} raw="${text}"`);
        }
        const data = JSON.parse(text);
        onData(data);
      } catch (e: any) {
        console.warn('[BLE] notify parse FAIL:', e?.message ?? e, 'raw=', ch.value);
      }
    },
  );
}

export async function writeCommand(device: Device, command: string): Promise<void> {
  const payload = Buffer.from(command, 'utf-8').toString('base64');
  await device.writeCharacteristicWithResponseForService(
    SERVICE_UUID,
    WRITE_CHAR_UUID,
    payload,
  );
}

// Firmware accepts a single ASCII char '0'..'3' where 0=HIGH, 1=MED, 2=LOW, 3=OFF.
// Pre-computed base64 of the single ASCII characters '0'..'3' to avoid the
// `Buffer is not defined` crash in RN (no Node polyfill installed).
//   '0' = 0x30 = "MA==" , '1' = "MQ==" , '2' = "Mg==" , '3' = "Mw=="
const LEVEL_B64 = ['MA==', 'MQ==', 'Mg==', 'Mw=='] as const;

export function writeLevel(device: Device | null, level: 0 | 1 | 2 | 3): void {
  if (!device && simMode) {
    simMotorLevel = level;
    console.log(`[SIM] writeLevel ${level}`);
    return;
  }
  if (!device) return;
  console.log(`[BLE-FAF] writeLevel ${level}`);
  device
    .writeCharacteristicWithoutResponseForService(
      SERVICE_UUID,
      WRITE_CHAR_UUID,
      LEVEL_B64[level],
    )
    .then(() => console.log(`[BLE-FAF] writeLevel ${level} OK`))
    .catch((e: any) => console.warn(`[BLE-FAF] writeLevel ${level} ERR:`, e?.message ?? e));
}

export async function disconnect(device: Device | null): Promise<void> {
  if (!device) {
    simMode = false;
    return;
  }
  try {
    await device.cancelConnection();
  } catch {}
}
