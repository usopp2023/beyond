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
import StageDots from '../components/StageDots';
import PerceptionLine from '../components/PerceptionLine';
import {
  startVoiceSession,
  stopVoiceSession,
  VoiceIntent,
} from '../services/voice';
import {
  AIFrame,
  AIStage,
  AIInput,
  callGrok,
  mockNextFrame,
  MOCK_LEN,
} from '../services/ai';

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
  const [aiOn, setAiOn] = useState(false);
  const [aiFrame, setAiFrame] = useState<AIFrame | null>(null);
  const aiTickRef = useRef(0);
  const aiTimerRef = useRef<NodeJS.Timeout | null>(null);
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
  // Rolling FSR history (raw 0..4095 values w/ timestamps) for AI aggregation.
  const fsrHistoryRef = useRef<{ t: number; v: number }[]>([]);
  // Contact-start timestamp (ms) — null when not in contact.
  const contactStartRef = useRef<number | null>(null);
  // Recent voice transcript (final) + timestamp, fed into AI input.
  const recentSpeechRef = useRef<{ text: string; t: number } | null>(null);

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
        // Append to rolling history; trim entries older than 12s.
        const now = Date.now();
        fsrHistoryRef.current.push({ t: now, v: t.fsr });
        const cutoff = now - 12000;
        while (
          fsrHistoryRef.current.length > 0 &&
          fsrHistoryRef.current[0].t < cutoff
        ) {
          fsrHistoryRef.current.shift();
        }
        // Track contact-start: threshold ~10% of max.
        const inContact = t.fsr > 400;
        if (inContact && contactStartRef.current == null) {
          contactStartRef.current = now;
        } else if (!inContact && contactStartRef.current != null) {
          // Only reset if released for ≥ 1s, to ignore micro-gaps.
          const recentlyContacted = fsrHistoryRef.current.some(
            (s) => s.t > now - 1000 && s.v > 400,
          );
          if (!recentlyContacted) contactStartRef.current = null;
        }
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
          recentSpeechRef.current = { text: t, t: Date.now() };
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
      if (aiTimerRef.current) clearInterval(aiTimerRef.current);
    };
  }, []);

  // AI mode: every ~2.5s we synthesize an AIInput describing the last window,
  // call Grok, render the returned frame, and push the level into writeLevel
  // (which still respects the cap). If Grok fails or times out, we fall back
  // to the scripted mock for that tick so the demo never goes blank.
  const aiStartedAtRef = useRef(0);
  const aiInFlightRef = useRef(false);
  const lastFrameRef = useRef<AIFrame | null>(null);

  // Build the real input fed to Grok from FSR history + last voice transcript.
  // Audio (moan/breath) is not wired yet — kept as a fixed neutral string
  // until step 3b adds mic envelope analysis.
  const buildInput = useCallback((): AIInput => {
    const now = Date.now();
    const elapsed = Math.floor((now - aiStartedAtRef.current) / 1000);
    const hist = fsrHistoryRef.current;

    // FSR summary
    let fsrSummary = '无接触';
    if (hist.length > 0) {
      const recent = hist.filter((s) => s.t > now - 5000);
      if (recent.length > 0) {
        const peak = Math.max(...recent.map((s) => s.v));
        const avg = recent.reduce((a, s) => a + s.v, 0) / recent.length;
        const peakPct = Math.round((peak / MAX_FSR) * 100);
        const avgPct = Math.round((avg / MAX_FSR) * 100);
        if (peak < 400) {
          fsrSummary = '几乎无压力';
        } else {
          const contactSec = contactStartRef.current
            ? Math.round((now - contactStartRef.current) / 1000)
            : 0;
          // Detect rhythm: count zero-crossings around mid level in last 5s.
          const mid = avg;
          let crosses = 0;
          for (let i = 1; i < recent.length; i++) {
            if (
              (recent[i - 1].v < mid && recent[i].v >= mid) ||
              (recent[i - 1].v >= mid && recent[i].v < mid)
            ) {
              crosses++;
            }
          }
          const rhythm = crosses > 6 ? ',有明显节律' : crosses > 2 ? ',轻微起伏' : ',平稳';
          fsrSummary = `接触 ${contactSec} 秒,平均 ${avgPct}%,峰值 ${peakPct}%${rhythm}`;
        }
      }
    }

    // Voice: include if heard within last 8s
    let speech = '';
    const sp = recentSpeechRef.current;
    if (sp && now - sp.t < 8000) {
      speech = sp.text;
    }

    return {
      fsrSummary,
      audioSummary: '未启用',
      recentSpeech: speech,
      lastStage: lastFrameRef.current?.stage,
      lastLevel: lastFrameRef.current?.level,
      secondsSinceStart: elapsed,
    };
  }, []);

  const handleToggleAi = useCallback(() => {
    if (aiOn) {
      if (aiTimerRef.current) clearInterval(aiTimerRef.current);
      aiTimerRef.current = null;
      aiInFlightRef.current = false;
      lastFrameRef.current = null;
      setAiOn(false);
      setAiFrame(null);
      return;
    }
    setAiOn(true);
    aiTickRef.current = 0;
    aiStartedAtRef.current = Date.now();
    lastFrameRef.current = null;

    const tick = async () => {
      if (aiInFlightRef.current) return; // skip if previous still running
      aiInFlightRef.current = true;
      const input = buildInput();
      console.log('[AI] input:', JSON.stringify(input));
      let frame: AIFrame;
      try {
        frame = await callGrok(input);
        console.log('[AI] grok →', frame.stage, frame.level, frame.perception);
      } catch (e: any) {
        console.warn('[AI] grok failed, falling back to mock:', e?.message ?? e);
        frame = mockNextFrame(aiTickRef.current);
      }
      lastFrameRef.current = frame;
      setAiFrame(frame);
      if (device && Platform.OS !== 'web') {
        writeLevel(device, frame.level);
      }
      aiTickRef.current = (aiTickRef.current + 1) % MOCK_LEN;
      aiInFlightRef.current = false;
    };
    tick();
    aiTimerRef.current = setInterval(tick, 2500);
  }, [aiOn, device, buildInput]);

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
          <Pressable onPress={handleToggleAi} style={styles.topBtn}>
            <Text
              style={[styles.topBtnText, aiOn && styles.topBtnTextActive]}>
              {aiOn ? '✦ AI 中' : '✧ AI'}
            </Text>
          </Pressable>
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

      <StageDots stage={aiOn ? (aiFrame?.stage ?? null) : null} />
      <PerceptionLine
        perception={aiOn ? (aiFrame?.perception ?? null) : null}
        intention={aiOn ? (aiFrame?.intention ?? null) : null}
      />

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
