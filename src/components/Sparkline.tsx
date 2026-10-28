import { useId, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

interface Props {
  values: readonly number[];
  color: string;
  height?: number;
  strokeWidth?: number;
}

/**
 * Minimal smoothed trend line with a faint gradient wash beneath it and a
 * dot on the latest reading. No axes, no grid — just the shape of progress.
 */
export function Sparkline({ values, color, height = 48, strokeWidth = 1.75 }: Props) {
  const [width, setWidth] = useState(0);
  const gradientId = `spark-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const pad = 4;
  const pts = toPoints(values, width, height, pad);
  const line = smoothPath(pts);
  const area = pts.length > 1 ? `${line} L ${pts[pts.length - 1].x} ${height} L ${pts[0].x} ${height} Z` : '';
  const last = pts[pts.length - 1];

  return (
    <View style={{ height }} onLayout={onLayout} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {width > 0 && pts.length > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.22} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {pts.length > 1 ? (
            <>
              <Path d={area} fill={`url(#${gradientId})`} />
              <Path d={line} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </>
          ) : null}
          <Circle cx={last.x} cy={last.y} r={6} fill={color} opacity={0.18} />
          <Circle cx={last.x} cy={last.y} r={3} fill={color} />
        </Svg>
      ) : null}
    </View>
  );
}

interface Pt {
  x: number;
  y: number;
}

function toPoints(values: readonly number[], width: number, height: number, pad: number): Pt[] {
  if (values.length === 0 || width === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = width - pad * 2 - 6; // leave room for the end dot halo
  const innerH = height - pad * 2;
  if (values.length === 1) return [{ x: pad + innerW, y: height / 2 }];
  return values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * innerW,
    // flat series sit in the middle rather than on the floor
    y: max === min ? height / 2 : pad + (1 - (v - min) / span) * innerH,
  }));
}

/** Catmull–Rom → cubic Bézier for a soft, natural curve. */
function smoothPath(pts: Pt[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  const t = 0.18;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}
