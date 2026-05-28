import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../theme';

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
  const [faceId, setFaceId] = useState(false);

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
            <Row icon="◍" title="你的设备" sub="已连接 · 电量 80%" right="›" />
            <Row icon="⊙" title="震动强度上限" right="中等 ›" last />
          </View>
        </View>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>隐私与安全</Text>
          <View style={styles.list}>
            <Row
              icon="⊘"
              title="声音只在本地处理"
              sub="永不上传,永不离开手机"
              control={<Toggle on={localOnly} onToggle={() => setLocalOnly(!localOnly)} />}
            />
            <Row
              icon="🔒"
              title="打开 App 需要验证"
              sub="用 Face ID 保护你的私密空间"
              control={<Toggle on={faceId} onToggle={() => setFaceId(!faceId)} />}
            />
            <Row icon="⊗" title="清除所有数据" right="›" last />
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
}: {
  icon: string;
  title: string;
  sub?: string;
  right?: string;
  control?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.item, last && styles.itemLast]}>
      <View style={styles.itemLeft}>
        <Text style={styles.itemIcon}>{icon}</Text>
        <View>
          <Text style={styles.itemTitle}>{title}</Text>
          {sub && <Text style={styles.itemSub}>{sub}</Text>}
        </View>
      </View>
      {control ?? (right && <Text style={styles.itemRight}>{right}</Text>)}
    </View>
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
