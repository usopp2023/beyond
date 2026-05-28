import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { colors } from '../theme';

export type Mood = 'gentle' | 'flow' | 'deep';

const MOOD_LABEL: Record<Mood, string> = {
  gentle: '轻柔',
  flow: '流动',
  deep: '深沉',
};
const MOOD_HOME: Record<Mood, number> = { gentle: 150, flow: 90, deep: 30 };
const MOOD_ROTATE: Record<Mood, number> = { gentle: 60, flow: 0, deep: -60 };

const W = 300;
const VISIBLE_H = 150;
const WHEEL = 300;
const CX = WHEEL / 2;
const CY = WHEEL / 2;
const R_OUTER = 118;
const R_INNER = 100;
const TICK_STEP = 10;

function polar(angleDeg: number, radius: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CX + Math.cos(a) * radius, y: CY - Math.sin(a) * radius };
}

// Snap helpers — must be 'worklet' so they can run on UI thread.
function nearestMoodRotation(value: number): number {
  'worklet';
  const opts = [MOOD_ROTATE.gentle, MOOD_ROTATE.flow, MOOD_ROTATE.deep];
  let best = opts[0];
  let bestDiff = Math.abs(value - best);
  for (let i = 1; i < opts.length; i++) {
    const d = Math.abs(value - opts[i]);
    if (d < bestDiff) {
      bestDiff = d;
      best = opts[i];
    }
  }
  return best;
}

function rotationToMood(r: number): Mood {
  'worklet';
  if (r >= 30) return 'gentle';
  if (r <= -30) return 'deep';
  return 'flow';
}

type Props = {
  mood: Mood;
  onChange: (m: Mood) => void;
};

export default function Dial({ mood, onChange }: Props) {
  const rotation = useSharedValue(MOOD_ROTATE[mood]);
  const startRotation = useSharedValue(0);
  const startAngle = useSharedValue(0);
  const layoutOffset = useSharedValue({ x: 0, y: 0, w: W, h: VISIBLE_H });
  const lastReportedMood = useSharedValue<Mood>(mood);
  const [activeMood, setActiveMood] = useState<Mood>(mood);

  // Intentionally no external→rotation sync effect: the Dial is fully
  // user-controlled. Parent's `mood` prop only seeds the initial position
  // (via useSharedValue above). After that, only the gesture moves the wheel
  // — so committing a mood doesn't yank the dial to the notch center.

  const setActiveMoodJS = (m: Mood) => setActiveMood(m);
  const emitChange = (m: Mood) => onChange(m);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .shouldCancelWhenOutside(false)
        .averageTouches(true)
        .onStart((e) => {
          const lo = layoutOffset.value;
          const vx = ((e.absoluteX - lo.x) / lo.w) * W;
          const vy = ((e.absoluteY - lo.y) / lo.h) * VISIBLE_H;
          startAngle.value = (Math.atan2(vy - CY, vx - CX) * 180) / Math.PI;
          startRotation.value = rotation.value;
        })
        .onUpdate((e) => {
          const lo = layoutOffset.value;
          const vx = ((e.absoluteX - lo.x) / lo.w) * W;
          const vy = ((e.absoluteY - lo.y) / lo.h) * VISIBLE_H;
          const cur = (Math.atan2(vy - CY, vx - CX) * 180) / Math.PI;
          let next = startRotation.value - (cur - startAngle.value);
          if (next < MOOD_ROTATE.deep - 25) next = MOOD_ROTATE.deep - 25;
          if (next > MOOD_ROTATE.gentle + 25) next = MOOD_ROTATE.gentle + 25;
          rotation.value = next;
          // Only cross the worklet→JS boundary when the active mood label
          // actually changes (boundary cross), not every frame.
          const nm = rotationToMood(next);
          if (nm !== lastReportedMood.value) {
            lastReportedMood.value = nm;
            runOnJS(setActiveMoodJS)(nm);
          }
        })
        .onEnd(() => {
          // No snap-back. The wheel stays exactly where the user released it;
          // the mood is decided by whichever zone the current rotation sits in.
          const nm = rotationToMood(rotation.value);
          lastReportedMood.value = nm;
          runOnJS(setActiveMoodJS)(nm);
          runOnJS(emitChange)(nm);
        }),
    [rotation, startRotation, startAngle, layoutOffset, lastReportedMood, onChange],
  );

  const wheelStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const ticks = useMemo(() => {
    const arr: {
      midX: number;
      midY: number;
      thickness: number;
      length: number;
      color: string;
      rotate: number;
    }[] = [];
    for (let deg = -90; deg <= 270; deg += TICK_STEP) {
      const isGear = [30, 90, 150].some((h) => Math.abs(deg - h) < 3);
      const rIn = isGear ? R_INNER - 7 : R_INNER;
      const thickness = isGear ? 3.5 : 2;
      const length = R_OUTER - rIn;
      const midR = (R_OUTER + rIn) / 2;
      const m = polar(deg, midR);
      arr.push({
        midX: m.x,
        midY: m.y,
        thickness,
        length,
        color: isGear ? '#DBA897' : '#E0CACB',
        rotate: 90 - deg,
      });
    }
    return arr;
  }, []);

  const labels = useMemo(
    () =>
      (['gentle', 'flow', 'deep'] as Mood[]).map((m) => {
        const p = polar(MOOD_HOME[m], R_INNER - 22);
        return { m, x: p.x, y: p.y, text: MOOD_LABEL[m] };
      }),
    [],
  );

  return (
    <View
      style={styles.outer}
      onLayout={(e) => {
        const { x, y, width, height } = e.nativeEvent.layout;
        layoutOffset.value = { x, y, w: width, h: height };
      }}>
      <GestureDetector gesture={pan}>
        <View style={styles.clip}>
          <Animated.View style={[styles.wheel, wheelStyle]}>
            {ticks.map((t, i) => (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: t.midX - t.thickness / 2,
                  top: t.midY - t.length / 2,
                  width: t.thickness,
                  height: t.length,
                  borderRadius: t.thickness / 2,
                  backgroundColor: t.color,
                  transform: [{ rotate: `${t.rotate}deg` }],
                }}
              />
            ))}
            {labels.map((l) => {
              const on = activeMood === l.m;
              return (
                <Text
                  key={l.m}
                  style={{
                    position: 'absolute',
                    left: l.x - 30,
                    top: l.y - 10,
                    width: 60,
                    textAlign: 'center',
                    color: on ? colors.roseDeep : colors.inkMute,
                    fontSize: on ? 15 : 12,
                    fontWeight: on ? '600' : '500',
                    letterSpacing: 1,
                  }}>
                  {l.text}
                </Text>
              );
            })}
          </Animated.View>
        </View>
      </GestureDetector>
      <View style={styles.marker} />
      <Text style={styles.hint}>拨动刻度盘 · 调整氛围</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    alignItems: 'center',
    paddingVertical: 12,
    width: W,
  },
  clip: {
    width: W,
    height: VISIBLE_H,
    overflow: 'hidden',
  },
  wheel: {
    width: WHEEL,
    height: WHEEL,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  marker: {
    position: 'absolute',
    top: 16,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.roseDeep,
  },
  hint: {
    fontSize: 11,
    color: colors.inkDim,
    letterSpacing: 1,
    marginTop: 6,
  },
});
