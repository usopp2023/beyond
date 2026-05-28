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

const STYLE = { density: 0.48, fill: 0.7 };
const STEPS = 120;

function buildPaths(t: number, state: WaveState, w: number, h: number) {
  const midY = h / 2;
  const freq = 1.8 + STYLE.density * 5;
  const level = state.amplitude * h * 0.4;

  const offsetAt = (xn: number) => {
    const w1 = Math.sin(xn * Math.PI * 2 * freq + t * 1.0);
    const w2 = Math.sin(xn * Math.PI * 2 * freq * 0.5 - t * 0.7) * 0.45;
    const combined = (w1 + w2) / 1.45;
    const taper = Math.sin(xn * Math.PI);
    return combined * taper * level;
  };

  // Smooth via Catmull-Rom-style midpoint quadratic Bezier: each segment
  // ends at the midpoint between consecutive sample points, using the
  // sample point itself as the control. This rounds off any sharpness left
  // by the discrete sampling.
  const pts: { x: number; up: number; dn: number }[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const xn = i / STEPS;
    const x = xn * w;
    const off = offsetAt(xn);
    pts.push({ x, up: midY - off, dn: midY + off });
  }

  const buildSmooth = (key: 'up' | 'dn') => {
    let d = `M${pts[0].x.toFixed(1)},${pts[0][key].toFixed(1)} `;
    for (let i = 1; i < pts.length - 1; i++) {
      const cx = pts[i].x;
      const cy = pts[i][key];
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i][key] + pts[i + 1][key]) / 2;
      d += `Q${cx.toFixed(1)},${cy.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)} `;
    }
    const last = pts[pts.length - 1];
    d += `L${last.x.toFixed(1)},${last[key].toFixed(1)} `;
    return d;
  };

  const top = buildSmooth('up');
  const bottom = buildSmooth('dn');

  // Fill: smoothed top forward + smoothed bottom reversed
  let fill = top;
  for (let i = pts.length - 1; i > 0; i--) {
    const cx = pts[i].x;
    const cy = pts[i].dn;
    const mx = (pts[i].x + pts[i - 1].x) / 2;
    const my = (pts[i].dn + pts[i - 1].dn) / 2;
    if (i === pts.length - 1) {
      fill += `L${cx.toFixed(1)},${cy.toFixed(1)} `;
    }
    fill += `Q${cx.toFixed(1)},${cy.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)} `;
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
