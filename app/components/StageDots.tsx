import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { AIStage } from '../services/ai';

const STAGES: AIStage[] = ['静谧', '萌动', '流动', '共鸣', '余韵'];

export default function StageDots({ stage }: { stage: AIStage | null }) {
  const activeIdx = stage ? STAGES.indexOf(stage) : -1;
  return (
    <View style={styles.row}>
      {STAGES.map((s, i) => {
        const isActive = i === activeIdx;
        const isPast = activeIdx >= 0 && i < activeIdx;
        return (
          <View key={s} style={styles.cell}>
            <View
              style={[
                styles.dot,
                isActive && styles.dotActive,
                isPast && styles.dotPast,
              ]}
            />
            <Text
              style={[
                styles.label,
                isActive && styles.labelActive,
                isPast && styles.labelPast,
              ]}>
              {s}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 36,
    paddingTop: 4,
    paddingBottom: 6,
  },
  cell: { alignItems: 'center', gap: 6, width: 50 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.inkMute,
    opacity: 0.45,
  },
  dotPast: { backgroundColor: colors.rose, opacity: 0.55 },
  dotActive: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.roseDeep,
    opacity: 1,
  },
  label: {
    fontSize: 10,
    color: colors.inkMute,
    letterSpacing: 2,
  },
  labelPast: { color: colors.inkDim },
  labelActive: { color: colors.roseDeep, fontWeight: '600' },
});
