import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { colors } from '../theme';
import {
  subscribeTelemetry,
  writeLevel,
  disconnect,
  getActiveDevice,
  setActiveDevice,
  Telemetry,
} from '../services/ble';
import Wave from '../components/Wave';
import Dial, { Mood } from '../components/Dial';
import {
  startVoiceSession,
  stopVoiceSession,
  VoiceIntent,
} from '../services/voice';

// Firmware uses inverted levels: 0=HIGH(strongest), 1=MED, 2=LOW, 3=OFF.
const MOOD_TO_LEVEL: Record<Mood, 0 | 1 | 2 | 3> = {
  gentle: 2,
  flow: 1,
  deep: 0,
};
const OFF_LEVEL = 3;
const MAX_FSR = 4095;

function levelToStrength(level: number): number {
  return Math.max(0, Math.min(1, (3 - level) / 3));
}

export default function ActiveScreen({ navigation }: any) {
  const device = getActiveDevice();
  const [mood, setMood] = useState<Mood>('gentle');
  const [telemetry, setTelemetry] = useState<Telemetry>({});
  const [paused, setPaused] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceText, setVoiceText] = useState<string>('');
  const voiceTextTimer = useRef<NodeJS.Timeout | null>(null);
  // Keep latest mood/paused accessible inside voice handler without recreating it.
  const moodRef = useRef<Mood>('gentle');
  const pausedRef = useRef(false);
  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const strengthRef = useRef(levelToStrength(MOOD_TO_LEVEL.gentle));
  const fsrRef = useRef(0);

  const getWaveState = useCallback(() => {
    const amp = strengthRef.current;
    const energy = fsrRef.current;
    // Widen the visible range so motor levels feel distinct:
    //   off (lvl3)→0.02  gentle(lvl2)→0.34  flow(lvl1)→0.66  deep(lvl0)→0.98
    // Flowspeed scales linearly with amp: when motor is off the phase freezes
    // so the wave goes flat AND still, not "flat but still wiggling".
    return {
      amplitude: 0.02 + amp * 0.96,
      flowSpeed: amp * 1.8,
      energy,
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || !device) {
      console.log('[Active] no device (web or null)');
      return;
    }
    console.log('[Active] mounted with device:', device.id);
    let logCnt = 0;
    const sub = subscribeTelemetry(device, (t) => {
      setTelemetry(t);
      if (typeof t.motorLevel === 'number') {
        const target = levelToStrength(t.motorLevel);
        strengthRef.current = strengthRef.current + (target - strengthRef.current) * 0.35;
      }
      if (typeof t.fsr === 'number') {
        const target = Math.min(t.fsr, MAX_FSR) / MAX_FSR;
        fsrRef.current = fsrRef.current + (target - fsrRef.current) * 0.35;
      }
      // Log every 5th packet so we don't drown the console.
      if (++logCnt % 5 === 0) {
        console.log(
          `[Telemetry] motorLevel=${t.motorLevel} fsr=${t.fsr} fsrLevel=${t.fsrLevel} → strength=${strengthRef.current.toFixed(2)}`,
        );
      }
    });
    return () => sub.remove();
  }, [device]);

  useEffect(() => {
    if (!device || Platform.OS === 'web') return;
    const t = setTimeout(() => {
      writeLevel(device, MOOD_TO_LEVEL.gentle);
    }, 300);
    return () => clearTimeout(t);
  }, [device]);

  const handleMoodChange = useCallback(
    (m: Mood) => {
      setMood(m);
      setPaused((p) => (p ? false : p)); // dragging the dial auto-resumes
      if (device && Platform.OS !== 'web') {
        writeLevel(device, MOOD_TO_LEVEL[m]);
      }
    },
    [device],
  );

  const flashVoiceText = (text: string, ms = 1800) => {
    setVoiceText(text);
    if (voiceTextTimer.current) clearTimeout(voiceTextTimer.current);
    voiceTextTimer.current = setTimeout(() => setVoiceText(''), ms);
  };

  const applyIntent = useCallback(
    (intent: VoiceIntent) => {
      if (!device || Platform.OS === 'web') return;
      const MOOD_ORDER: Mood[] = ['deep', 'flow', 'gentle']; // strongest → weakest
      const curIdx = MOOD_ORDER.indexOf(moodRef.current);
      if (intent.kind === 'stronger') {
        const next = MOOD_ORDER[Math.max(0, curIdx - 1)];
        setMood(next);
        setPaused(false);
        writeLevel(device, MOOD_TO_LEVEL[next]);
      } else if (intent.kind === 'gentler') {
        const next = MOOD_ORDER[Math.min(MOOD_ORDER.length - 1, curIdx + 1)];
        setMood(next);
        setPaused(false);
        writeLevel(device, MOOD_TO_LEVEL[next]);
      } else if (intent.kind === 'mood') {
        setMood(intent.mood);
        setPaused(false);
        writeLevel(device, MOOD_TO_LEVEL[intent.mood]);
      } else if (intent.kind === 'stop') {
        writeLevel(device, OFF_LEVEL);
        setPaused(true);
      } else if (intent.kind === 'resume') {
        writeLevel(device, MOOD_TO_LEVEL[moodRef.current]);
        setPaused(false);
      }
    },
    [device],
  );

  const handleToggleListen = useCallback(() => {
    if (listening) {
      stopVoiceSession();
      setListening(false);
      flashVoiceText('已停止聆听');
    } else {
      setListening(true);
      flashVoiceText('正在聆听…', 3000);
      startVoiceSession({
        onPartial: (t) => flashVoiceText(t, 4000),
        onFinal: (t, intent) => {
          flashVoiceText(t, 2200);
          if (intent) applyIntent(intent);
        },
        onError: (msg) => {
          flashVoiceText('听不清: ' + msg, 2500);
        },
        onEnd: () => {
          setListening(false);
        },
      });
    }
  }, [listening, applyIntent]);

  useEffect(() => {
    return () => {
      stopVoiceSession();
      if (voiceTextTimer.current) clearTimeout(voiceTextTimer.current);
    };
  }, []);

  const handleTogglePause = () => {
    if (!device || Platform.OS === 'web') return;
    if (paused) {
      // Resume: re-send current mood's level.
      writeLevel(device, MOOD_TO_LEVEL[mood]);
      setPaused(false);
    } else {
      writeLevel(device, OFF_LEVEL);
      setPaused(true);
    }
  };

  const handleClose = async () => {
    if (device && Platform.OS !== 'web') {
      writeLevel(device, OFF_LEVEL);
      await disconnect(device);
      setActiveDevice(null);
    }
    navigation.replace('Connect');
  };

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.navigate('Settings')}
          style={styles.topBtn}>
          <Text style={styles.topBtnText}>⚐ 我的</Text>
        </Pressable>
        <View style={styles.topRight}>
          <Pressable onPress={handleToggleListen} style={styles.topBtn}>
            <Text
              style={[styles.topBtnText, listening && styles.topBtnTextActive]}>
              {listening ? '◉ 聆听中' : '◯ 聆听'}
            </Text>
          </Pressable>
          <Pressable onPress={handleTogglePause} style={styles.topBtn}>
            <Text
              style={[styles.topBtnText, paused && styles.topBtnTextActive]}>
              {paused ? '▶ 继续' : '❚❚ 暂停'}
            </Text>
          </Pressable>
        </View>
      </View>

      {voiceText ? (
        <View style={styles.voiceOverlay} pointerEvents="none">
          <Text style={styles.voiceText}>{voiceText}</Text>
        </View>
      ) : null}

      <View style={styles.waveWrap}>
        <Wave width={372} height={240} getState={getWaveState} />
      </View>

      <View style={styles.dialWrap}>
        <Dial mood={mood} onChange={handleMoodChange} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 48,
    paddingBottom: 8,
  },
  topBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  topBtnText: {
    fontSize: 13,
    color: colors.inkSoft,
    letterSpacing: 1,
    fontWeight: '500',
  },
  topBtnTextActive: { color: colors.roseDeep, fontWeight: '600' },
  topRight: { flexDirection: 'row', gap: 4 },
  voiceOverlay: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 18,
  },
  voiceText: {
    fontSize: 14,
    color: colors.roseDeep,
    letterSpacing: 1,
    fontWeight: '500',
  },
  close: {
    alignSelf: 'flex-start',
    marginTop: 4,
    marginLeft: 22,
    padding: 6,
  },
  closeText: { fontSize: 13, color: colors.inkSoft, letterSpacing: 1 },
  waveWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialWrap: {
    paddingBottom: 40,
    alignItems: 'center',
  },
});
