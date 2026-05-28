import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { colors } from '../theme';
import {
  getActiveDevice,
  setActiveDevice,
  disconnect,
  writeLevel,
} from '../services/ble';
import {
  getStrengthCap,
  setStrengthCap,
  subscribeStrengthCap,
  resetAllPrefs,
  CAP_LABELS,
  StrengthCap,
} from '../services/prefs';

const CAP_ORDER: StrengthCap[] = ['high', 'med', 'low'];

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      style={[styles.toggle, on && styles.toggleOn]}>
      <View
        style={[styles.toggleKnob, on && styles.toggleKnobOn]}
      />
    </Pressable>
  );
}

export default function SettingsScreen({ navigation }: any) {
  const [localOnly, setLocalOnly] = useState(true);
  const [cap, setCap] = useState<StrengthCap>(getStrengthCap());
  const [device, setDevice] = useState(getActiveDevice());

  useEffect(() => {
    const unsub = subscribeStrengthCap(setCap);
    return unsub;
  }, []);

  const cycleCap = () => {
    const idx = CAP_ORDER.indexOf(cap);
    const next = CAP_ORDER[(idx + 1) % CAP_ORDER.length];
    setStrengthCap(next);
  };

  const handleDevicePress = () => {
    if (!device) {
      navigation.replace('Connect');
      return;
    }
    Alert.alert('断开连接', '断开后会回到连接页', [
      { text: '取消', style: 'cancel' },
      {
        text: '断开',
        style: 'destructive',
        onPress: async () => {
          try { writeLevel(device, 3); } catch {}
          await disconnect(device);
          setActiveDevice(null);
          setDevice(null);
          navigation.replace('Connect');
        },
      },
    ]);
  };

  const handleClearAll = () => {
    Alert.alert(
      '清除所有数据',
      '会断开设备、重置偏好设置，回到连接页。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清除',
          style: 'destructive',
          onPress: async () => {
            const d = getActiveDevice();
            if (d) {
              try { writeLevel(d, 3); } catch {}
              await disconnect(d);
              setActiveDevice(null);
            }
            resetAllPrefs();
            setLocalOnly(true);
            navigation.replace('Connect');
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.topnav}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← 返回</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>我的</Text>
        </View>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>设备</Text>
          <View style={styles.list}>
            <Row
              icon="◍"
              title="你的设备"
              sub={device ? `已连接 · ${device.name ?? 'Vibration_Egg3'}` : '未连接'}
              right={device ? '断开 ›' : '去连接 ›'}
              onPress={handleDevicePress}
            />
            <Row
              icon="⊙"
              title="震动强度上限"
              sub="拖动刻度盘和语音都会被限制在这个上限内"
              right={`${CAP_LABELS[cap]} ›`}
              onPress={cycleCap}
              last
            />
          </View>
        </View>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>隐私与安全</Text>
          <View style={styles.list}>
            <Row
              icon="⊘"
              title="声音只在本地处理"
              sub="即将上线"
              control={<Toggle on={localOnly} onToggle={() => setLocalOnly(!localOnly)} />}
              disabled
            />
            <Row
              icon="⊗"
              title="清除所有数据"
              right="›"
              onPress={handleClearAll}
              last
            />
          </View>
        </View>

        <Text style={styles.devEntry}>Resona · v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

function Row({
  icon,
  title,
  sub,
  right,
  control,
  last,
  onPress,
  disabled,
}: {
  icon: string;
  title: string;
  sub?: string;
  right?: string;
  control?: React.ReactNode;
  last?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const Container: any = onPress ? Pressable : View;
  return (
    <Container
      onPress={onPress}
      style={[styles.item, last && styles.itemLast, disabled && styles.itemDisabled]}>
      <View style={styles.itemLeft}>
        <Text style={styles.itemIcon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemTitle}>{title}</Text>
          {sub && <Text style={styles.itemSub}>{sub}</Text>}
        </View>
      </View>
      {control ?? (right && <Text style={styles.itemRight}>{right}</Text>)}
    </Container>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topnav: { paddingTop: 48, paddingHorizontal: 22 },
  back: { fontSize: 14, color: colors.inkSoft, paddingVertical: 6 },
  content: { paddingHorizontal: 24, paddingBottom: 30 },
  hero: { paddingTop: 24, paddingBottom: 22, paddingHorizontal: 8 },
  eyebrow: {
    fontSize: 12,
    color: colors.inkDim,
    letterSpacing: 3,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  group: { marginBottom: 22 },
  groupLabel: {
    fontSize: 11,
    color: colors.inkDim,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 10,
    marginHorizontal: 8,
  },
  list: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    overflow: 'hidden',
  },
  item: {
    paddingVertical: 15,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  itemLast: { borderBottomWidth: 0 },
  itemDisabled: { opacity: 0.45 },
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  itemIcon: { fontSize: 16, width: 22, textAlign: 'center', color: colors.ink },
  itemTitle: { fontSize: 14, color: colors.ink, fontWeight: '500' },
  itemSub: { fontSize: 11, color: colors.inkDim, marginTop: 2 },
  itemRight: { fontSize: 13, color: colors.inkDim },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.line,
    padding: 3,
  },
  toggleOn: { backgroundColor: colors.rose },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFCFB',
  },
  toggleKnobOn: { transform: [{ translateX: 18 }] },
  devEntry: {
    textAlign: 'center',
    paddingVertical: 24,
    fontSize: 11,
    color: colors.inkMute,
    letterSpacing: 1,
  },
});
