// Grok via OpenRouter. The model receives a *text* description of the last
// 2-second window and returns a structured perception/intention JSON.
//
// Audio is NOT sent — we describe it in words (e.g. "急促呼吸 8 秒"). This
// keeps payload tiny and is the only shape Grok accepts anyway.

import { OPENROUTER_API_KEY, OPENROUTER_MODEL } from './aiConfig';

export type AIStage = '静谧' | '萌动' | '流动' | '共鸣' | '余韵';

export type AIFrame = {
  stage: AIStage;
  level: 0 | 1 | 2 | 3;       // firmware level (0=HIGH, 3=OFF)
  confidence: number;          // 0..1
  perception: string;          // what the model "hears/feels", 1 line
  intention: string;           // what it intends to do, 1 line
};

export type AIInput = {
  fsrSummary: string;          // e.g. "接触稳定 12 秒,平均 0.6"
  audioSummary: string;        // e.g. "急促呼吸,偶尔轻声"
  recentSpeech?: string;       // recent voice transcript (if any)
  lastStage?: AIStage;
  lastLevel?: 0 | 1 | 2 | 3;
  secondsSinceStart: number;
};

const SYSTEM_PROMPT = `你是一个身心放松陪伴设备的感知模型。基于压力传感器读数与用户的语音,判断当前所处的感受阶段,并给出一段温柔、克制、有诗意的"感知"与"意图"。

阶段定义(必须从这 5 个中选一个):
- 静谧: 接触很轻、用户安静
- 萌动: 接触稳定、节奏开始延展
- 流动: 接触持续、节奏明显
- 共鸣: 节奏密集、用户有明显回应
- 余韵: 接触松开、归于平静

输出节奏档位(振动强度,0=最强 1=中 2=轻 3=停):
- 静谧→2  萌动→1  流动→0  共鸣→0  余韵→3

风格与合规要求(非常重要):
- perception: 一句话描述你"感受到了什么",不超过 18 个汉字
- intention: 一句话描述你"想怎么回应",不超过 14 个汉字
- 必须使用中性、诗意的意象,例如: 呼吸、节奏、温度、流动、光线、声音、心跳、距离、轻重
- 严禁使用任何性、生殖、隐私部位、医学症状、痛感等词汇
- 严禁暗示性行为、性快感、性高潮等内容
- 整体语境是"陪伴与放松",不是"亲密关系"
- 必须返回严格 JSON,字段: stage, level, confidence, perception, intention`;

export async function callGrok(input: AIInput): Promise<AIFrame> {
  const userMsg = JSON.stringify({
    fsr: input.fsrSummary,
    audio: input.audioSummary,
    speech: input.recentSpeech ?? '',
    lastStage: input.lastStage ?? '试探',
    lastLevel: input.lastLevel ?? 2,
    elapsedSeconds: input.secondsSinceStart,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://resona.local',
        'X-Title': 'Resona',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        response_format: { type: 'json_object' },
        temperature: 0.6,
        max_tokens: 200,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 120)}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    const parsed = safeParseFrame(content);
    if (!parsed) throw new Error('parse failed: ' + content.slice(0, 100));
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

function safeParseFrame(s: string): AIFrame | null {
  try {
    const obj = JSON.parse(s);
    if (
      typeof obj.stage === 'string' &&
      typeof obj.level === 'number' &&
      typeof obj.perception === 'string' &&
      typeof obj.intention === 'string'
    ) {
      return {
        stage: obj.stage,
        level: Math.max(0, Math.min(3, obj.level | 0)) as 0 | 1 | 2 | 3,
        confidence: typeof obj.confidence === 'number' ? obj.confidence : 0.7,
        perception: obj.perception.slice(0, 40),
        intention: obj.intention.slice(0, 40),
      };
    }
  } catch {}
  return null;
}

// -------------------- mock layer for UI work --------------------
// A scripted sequence of frames the UI can iterate over while the real
// pipeline (audio features, FSR aggregation) isn't wired yet.

const MOCK_SEQUENCE: AIFrame[] = [
  { stage: '静谧', level: 2, confidence: 0.7, perception: '光线安静地落下', intention: '和你一起呼吸' },
  { stage: '静谧', level: 2, confidence: 0.74, perception: '周围还很安静', intention: '慢慢地等' },
  { stage: '萌动', level: 1, confidence: 0.78, perception: '节奏开始延展', intention: '慢慢温下来' },
  { stage: '萌动', level: 1, confidence: 0.82, perception: '气息渐渐绵长', intention: '保持这个节奏' },
  { stage: '流动', level: 0, confidence: 0.85, perception: '心跳和节奏靠近', intention: '稳稳地跟着' },
  { stage: '流动', level: 0, confidence: 0.88, perception: '节奏更连贯了', intention: '不催不慢' },
  { stage: '共鸣', level: 0, confidence: 0.91, perception: '一切都同频起来', intention: '一直陪着你' },
  { stage: '余韵', level: 3, confidence: 0.86, perception: '一切回到柔软', intention: '安静退到旁边' },
];

export function mockNextFrame(idx: number): AIFrame {
  return MOCK_SEQUENCE[idx % MOCK_SEQUENCE.length];
}

export const MOCK_LEN = MOCK_SEQUENCE.length;
