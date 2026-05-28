import { Platform, PermissionsAndroid } from 'react-native';
import { BleManager, Device, Subscription } from 'react-native-ble-plx';
import { clampLevelByCap } from './prefs';

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
  device: Device,
  onData: (t: Telemetry) => void,
  onError?: (err: Error) => void,
): Subscription {
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

export function writeLevel(device: Device, level: 0 | 1 | 2 | 3): void {
  const capped = clampLevelByCap(level);
  if (capped !== level) {
    console.log(`[BLE-FAF] writeLevel ${level} → clamped to ${capped} by cap`);
  } else {
    console.log(`[BLE-FAF] writeLevel ${level}`);
  }
  device
    .writeCharacteristicWithoutResponseForService(
      SERVICE_UUID,
      WRITE_CHAR_UUID,
      LEVEL_B64[capped],
    )
    .then(() => console.log(`[BLE-FAF] writeLevel ${capped} OK`))
    .catch((e: any) => console.warn(`[BLE-FAF] writeLevel ${capped} ERR:`, e?.message ?? e));
}

export async function disconnect(device: Device): Promise<void> {
  try {
    await device.cancelConnection();
  } catch {}
}
