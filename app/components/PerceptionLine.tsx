import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors } from '../theme';

// Two-line fading subtitle: top = perception ("感受到什么"), bottom = intention ("想怎么回应")
// Fades in over 1.2s, stays, then fades out the next time the line changes.
export default function PerceptionLine({
  perception,
  intention,
}: {
  perception: string | null;
  intention: string | null;
}) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!perception) {
      opacity.value = withTiming(0, { duration: 600, easing: Easing.in(Easing.quad) });
      return;
    }
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) });
  }, [perception, intention]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.wrap, animStyle]} pointerEvents="none">
      <Animated.Text style={styles.perception}>{perception ?? ''}</Animated.Text>
      <Animated.Text style={styles.intention}>{intention ?? ''}</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 6,
    minHeight: 48,
  },
  perception: {
    fontSize: 15,
    color: colors.roseDeep,
    letterSpacing: 3,
    fontWeight: '500',
    textAlign: 'center',
  },
  intention: {
    fontSize: 11,
    color: colors.inkDim,
    letterSpacing: 2,
    marginTop: 4,
    textAlign: 'center',
  },
});
