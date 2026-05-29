import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  Alert,
  Platform,
} from 'react-native';
import { colors } from '../theme';
import {
  requestAndroidPermissions,
  scanForDevice,
  connectAndPrepare,
  setActiveDevice,
  setSimMode,
  DEVICE_NAME,
} from '../services/ble';
import type { Device } from 'react-native-ble-plx';

type Status = 'scanning' | 'found' | 'connecting' | 'connected' | 'error';

export default function ConnectScreen({ navigation }: any) {
  const [status, setStatus] = useState<Status>('scanning');
  const [device, setDevice] = useState<Device | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const pulse = useRef(new Animated.Value(0.3)).current;
  const stopScanRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.3,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulse]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (Platform.OS === 'web') {
        // Web preview can't do native BLE; stub a found state so UI is testable.
        setTimeout(() => mounted && setStatus('found'), 1200);
        return;
      }
      const ok = await requestAndroidPermissions();
      if (!ok) {
        setStatus('error');
        setErrorMsg('需要蓝牙与定位权限');
        return;
      }
      stopScanRef.current = scanForDevice(
        (d) => {
          if (!mounted) return;
          stopScanRef.current?.();
          setDevice(d);
          setStatus('found');
        },
        (e) => {
          if (!mounted) return;
          setStatus('error');
          setErrorMsg(e.message);
        },
      );
    })();
    return () => {
      mounted = false;
      stopScanRef.current?.();
    };
  }, []);

  const handleConnect = async () => {
    if (Platform.OS === 'web') {
      setStatus('connected');
      return;
    }
    if (!device) return;
    setStatus('connecting');
    try {
      const c = await connectAndPrepare(device);
      setDevice(c);
      setActiveDevice(c);
      setStatus('connected');
    } catch (e: any) {
      setStatus('error');
      setErrorMsg(e?.message ?? '连接失败');
    }
  };

  const isConnected = status === 'connected';
  const label =
    status === 'scanning'
      ? '正在寻找你的设备'
      : status === 'connecting'
        ? '正在连接…'
        : status === 'connected'
          ? '已连接'
          : status === 'error'
            ? '出错了'
            : '已发现';
  const sub =
    status === 'scanning'
      ? '让蓝牙保持开启,设备靠近一些'
      : status === 'connected'
        ? '一切准备好了'
        : '就在附近 · 信号良好';
  const cta =
    status === 'connected'
      ? '✓ 已连接'
      : status === 'connecting'
        ? '...'
        : status === 'found'
          ? '连接 →'
          : '搜索中…';

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>RESONA</Text>
          <Text style={styles.title}>连接你的设备</Text>
        </View>

        <View style={styles.labelRow}>
          <Animated.View
            style={[
              styles.dot,
              isConnected ? styles.dotStill : { opacity: pulse },
            ]}
          />
          <Text style={styles.labelText}>{label}</Text>
        </View>

        <Pressable
          style={[styles.devRow, isConnected && styles.devRowConnected]}
          onPress={status === 'found' ? handleConnect : undefined}
          disabled={status !== 'found'}>
          <View>
            <Text style={styles.devName}>你的设备</Text>
            <Text style={styles.devSub}>{sub}</Text>
          </View>
          <Text style={[styles.devGo, isConnected && styles.devGoConnected]}>{cta}</Text>
        </Pressable>

        {isConnected && (
          <View style={styles.readyZone}>
            <Pressable
              style={styles.btnPrimary}
              onPress={() => navigation.navigate('Active')}>
              <Text style={styles.btnPrimaryText}>轻 触 开 始</Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate('Settings')}>
              <Text style={styles.settingsLink}>设置与隐私</Text>
            </Pressable>
          </View>
        )}

        {status === 'error' && (
          <Text style={styles.errText}>{errorMsg}</Text>
        )}

        <View style={{ flex: 1 }} />

        <Pressable
          style={styles.simBtn}
          onPress={() => {
            stopScanRef.current?.();
            setActiveDevice(null);
            setSimMode(true);
            navigation.navigate('Active');
          }}>
          <Text style={styles.simBtnText}>无设备 · 模拟演示</Text>
        </Pressable>

        <Text style={styles.privacyNote}>
          连接是私密的。你的声音只在这台手机上处理,{'\n'}不会上传,不会离开你。
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingHorizontal: 32, paddingTop: 30 },
  hero: { marginBottom: 26 },
  eyebrow: {
    fontSize: 12,
    color: colors.inkDim,
    letterSpacing: 3,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 26,
    color: colors.ink,
    fontWeight: '300',
    letterSpacing: 1,
    marginTop: 14,
  },
  subtitle: {
    fontSize: 13,
    color: colors.inkDim,
    letterSpacing: 1,
    marginTop: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.rose,
  },
  dotStill: { opacity: 1 },
  labelText: {
    fontSize: 11,
    color: colors.inkDim,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  devRow: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  devRowConnected: {
    borderColor: colors.roseSoft,
    backgroundColor: colors.roseWash,
  },
  devName: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  devSub: { fontSize: 11, color: colors.inkDim, marginTop: 3 },
  devGo: { fontSize: 13, color: colors.rose, fontWeight: '600' },
  devGoConnected: { color: colors.roseDeep },
  readyZone: { marginTop: 8 },
  btnPrimary: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 20,
    backgroundColor: colors.rose,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: '#FFFCFB',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 2,
  },
  settingsLink: {
    textAlign: 'center',
    marginTop: 16,
    fontSize: 12,
    color: colors.inkDim,
    letterSpacing: 1.5,
  },
  errText: {
    marginTop: 12,
    color: '#b85a5a',
    fontSize: 12,
    textAlign: 'center',
  },
  simBtn: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'transparent',
    marginBottom: 4,
  },
  simBtnText: {
    fontSize: 12,
    color: colors.inkDim,
    letterSpacing: 3,
    fontWeight: '500',
  },
  privacyNote: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.inkDim,
    lineHeight: 18,
    paddingHorizontal: 10,
    paddingVertical: 14,
  },
});
