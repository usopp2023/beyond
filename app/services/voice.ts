import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

// The native module extends EventEmitter; subscribe via .addListener(name, fn)
// which returns a Subscription with .remove(). No separate helper export.
function listen(eventName: string, fn: (event: any) => void) {
  return (ExpoSpeechRecognitionModule as any).addListener(eventName, fn);
}

export type VoiceIntent =
  | { kind: 'stronger' }
  | { kind: 'gentler' }
  | { kind: 'mood'; mood: 'gentle' | 'flow' | 'deep' }
  | { kind: 'stop' }
  | { kind: 'resume' };

// Keyword tables — clean, command-restrained style. Order matters: longer
// or more specific phrases listed first.
const TABLE: { intent: VoiceIntent; words: string[] }[] = [
  {
    intent: { kind: 'mood', mood: 'gentle' },
    words: ['轻柔', '最轻'],
  },
  {
    intent: { kind: 'mood', mood: 'flow' },
    words: ['流动', '中等'],
  },
  {
    intent: { kind: 'mood', mood: 'deep' },
    words: ['深沉', '最强', '最大'],
  },
  {
    intent: { kind: 'stop' },
    words: ['暂停', '停下', '停', '关掉', '不要了', '不要', '够了', '别动'],
  },
  {
    intent: { kind: 'resume' },
    words: ['继续', '开始', '恢复'],
  },
  {
    intent: { kind: 'stronger' },
    words: [
      '再强一点',
      '再强',
      '更强',
      '加强',
      '加大',
      '再大',
      '大点',
      '强一点',
      '不够',
    ],
  },
  {
    intent: { kind: 'gentler' },
    words: ['再轻一点', '轻一点', '小点', '太强', '弱一点', '慢点', '减一点'],
  },
];

export function matchIntent(text: string): VoiceIntent | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, '');
  for (const row of TABLE) {
    for (const w of row.words) {
      if (t.includes(w)) return row.intent;
    }
  }
  return null;
}

export type VoiceCallbacks = {
  onPartial?: (text: string) => void;
  onFinal?: (text: string, intent: VoiceIntent | null) => void;
  onError?: (msg: string) => void;
  onEnd?: () => void;
};

let listeners: { remove: () => void }[] = [];

export async function startVoiceSession(cb: VoiceCallbacks): Promise<void> {
  console.log('[Voice] startVoiceSession');
  try {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    console.log('[Voice] perm:', JSON.stringify(perm));
    if (!perm.granted) {
      cb.onError?.('麦克风权限被拒绝');
      return;
    }
  } catch (e: any) {
    console.warn('[Voice] perm err:', e?.message ?? e);
    cb.onError?.('权限请求失败: ' + (e?.message ?? e));
    return;
  }

  // Do NOT preemptively abort here — the abort event arrives asynchronously
  // and would be caught by our freshly-attached error listener, masquerading
  // as a startup failure. The UI flow already prevents overlapping sessions.
  cleanup();

  listeners = [
    listen('result', (event: any) => {
      const res = event?.results?.[0];
      if (!res?.transcript) return;
      const text: string = res.transcript;
      console.log('[Voice] result', event.isFinal ? 'FINAL' : 'partial', text);
      if (event.isFinal) {
        cb.onFinal?.(text, matchIntent(text));
      } else {
        cb.onPartial?.(text);
      }
    }),
    listen('error', (event: any) => {
      const code = event?.error ?? 'unknown';
      const msg = event?.message ?? '';
      console.warn(`[Voice] error code=${code} msg=${msg}`);
      cb.onError?.(`${code}${msg ? ' / ' + msg : ''}`);
    }),
    listen('start', () => {
      console.log('[Voice] start event');
    }),
    listen('end', () => {
      console.log('[Voice] end event');
      cb.onEnd?.();
    }),
  ];

  try {
    console.log('[Voice] calling start()');
    ExpoSpeechRecognitionModule.start({
      lang: 'zh-CN',
      interimResults: true,
      continuous: true,
      maxAlternatives: 1,
    });
  } catch (e: any) {
    console.warn('[Voice] start threw:', e?.message ?? e);
    cb.onError?.('启动失败: ' + (e?.message ?? e));
  }
}

export function stopVoiceSession(): void {
  try {
    ExpoSpeechRecognitionModule.stop();
  } catch {}
  cleanup();
}

function cleanup() {
  listeners.forEach((l) => {
    try {
      l.remove();
    } catch {}
  });
  listeners = [];
}
