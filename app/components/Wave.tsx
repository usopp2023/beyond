import React, { useEffect, useRef, useState } from 'react';
import Svg, { Path, Defs, LinearGradient, Stop, RadialGradient, Circle } from 'react-native-svg';
import { colors } from '../theme';

type WaveState = {
  amplitude: number; // 0..1, height of the wave
  flowSpeed: number; // 0..1, animation speed
  energy: number;    // 0..1, fill intensity
};

type Props = {
  width?: number;
  height?: number;
  getState: () => WaveState;
};

const STYLE = { density: 0.6, fill: 0.7 };
const STEPS = 90;

function buildPaths(t: number, state: WaveState, w: number, h: number) {
  const midY = h / 2;
  const freq = 2 + STYLE.density * 7;
  const level = state.amplitude * h * 0.42;

  const offsetAt = (xn: number) => {
    const w1 = Math.sin(xn * Math.PI * 2 * freq + t * 1.0);
    const w2 = Math.sin(xn * Math.PI * 2 * freq * 0.5 - t * 0.7) * 0.6;
    const w3 = Math.sin(xn * Math.PI * 2 * freq * 1.7 + t * 1.4) * 0.35;
    const combined = (w1 + w2 + w3) / 1.95;
    const taper = Math.sin(xn * Math.PI);
    return combined * taper * level;
  };

  let top = '';
  let bottom = '';
  for (let i = 0; i <= STEPS; i++) {
    const xn = i / STEPS;
    const x = xn * w;
    const off = offsetAt(xn);
    const cmd = i === 0 ? 'M' : 'L';
    top += `${cmd}${x.toFixed(1)},${(midY - off).toFixed(1)} `;
    bottom += `${cmd}${x.toFixed(1)},${(midY + off).toFixed(1)} `;
  }

  // Fill path: top then bottom reversed -> closed shape
  let fill = '';
  for (let i = 0; i <= STEPS; i++) {
    const xn = i / STEPS;
    const x = xn * w;
    fill += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${(midY - offsetAt(xn)).toFixed(1)} `;
  }
  for (let i = STEPS; i >= 0; i--) {
    const xn = i / STEPS;
    const x = xn * w;
    fill += `L${x.toFixed(1)},${(midY + offsetAt(xn)).toFixed(1)} `;
  }
  fill += 'Z';

  return { top, bottom, fill };
}

export default function Wave({ width = 372, height = 240, getState }: Props) {
  const [paths, setPaths] = useState(() =>
    buildPaths(Math.random() * 10, getState(), width, height),
  );
  const tRef = useRef(Math.random() * 10);
  const rafRef = useRef<number | null>(null);
  const stateRef = useRef<WaveState>(getState());
  const fillAlpha = useRef(0.2);

  useEffect(() => {
    let mounted = true;
    const loop = () => {
      if (!mounted) return;
      const st = getState();
      stateRef.current = st;
      // No baseline phase advance — when flowSpeed is 0 (motor off), the wave
      // truly freezes instead of continuing to wiggle.
      tRef.current += 0.016 * st.flowSpeed * 2.0;
      fillAlpha.current = STYLE.fill * (0.22 + st.energy * 0.18);
      setPaths(buildPaths(tRef.current, st, width, height));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      mounted = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [width, height, getState]);

  const midY = height / 2;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="waveFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.rose} stopOpacity="0" />
          <Stop offset="0.5" stopColor={colors.rose} stopOpacity={fillAlpha.current.toFixed(3)} />
          <Stop offset="1" stopColor={colors.rose} stopOpacity="0" />
        </LinearGradient>
        <RadialGradient id="endLight" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFEDEF" stopOpacity="0.7" />
          <Stop offset="1" stopColor="#FFEDEF" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Path d={paths.fill} fill="url(#waveFill)" />
      {/* outer soft halo stroke */}
      <Path d={paths.top} stroke={colors.rose} strokeOpacity={0.4} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d={paths.bottom} stroke={colors.rose} strokeOpacity={0.4} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* core stroke */}
      <Path d={paths.top} stroke={colors.roseDeep} strokeOpacity={0.85} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d={paths.bottom} stroke={colors.roseDeep} strokeOpacity={0.85} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* endpoint glows */}
      <Circle cx={0} cy={midY} r={14} fill="url(#endLight)" />
      <Circle cx={width} cy={midY} r={14} fill="url(#endLight)" />
    </Svg>
  );
}
