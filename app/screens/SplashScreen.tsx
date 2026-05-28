import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme';

export default function SplashScreen({ navigation }: any) {
  return (
    <Pressable style={styles.root} onPress={() => navigation.replace('Connect')}>
      <View style={styles.center}>
        <Text style={styles.wordmark}>Resona</Text>
        <Text style={styles.tagline}>你 值 得 被 回 应</Text>
      </View>
      <Text style={styles.hint}>轻 触 继 续</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  wordmark: {
    fontSize: 56,
    color: colors.roseDeep,
    fontWeight: '300',
    letterSpacing: 6,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 14,
    color: colors.inkDim,
    letterSpacing: 6,
    fontWeight: '400',
    marginTop: 18,
  },
  hint: {
    textAlign: 'center',
    paddingBottom: 48,
    fontSize: 12,
    color: colors.inkMute,
    letterSpacing: 4,
  },
});
