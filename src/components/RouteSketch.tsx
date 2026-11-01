import { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { projectRoute, type RoutePoint } from '../domain/track';
import type { Phase } from '../domain/types';
import { loadRoute } from '../state/routes';
import { colors, tones } from '../theme/tokens';

interface Props {
  sessionId: string;
  phases: readonly Phase[];
  height?: number;
}

/**
 * The route you walked, drawn as a line coloured by stage (hard intervals in
 * the workout's accent). No map tiles — so no map API key or network needed.
 */
export function RouteSketch({ sessionId, phases, height = 180 }: Props) {
  const [route, setRoute] = useState<RoutePoint[] | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadRoute(sessionId).then((r) => {
      if (!cancelled) setRoute(r);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  if (!route || route.length < 2) return null;

  const pts = width > 0 ? projectRoute(route, width, height) : [];
  // One polyline per run of the same stage, overlapping by a point so there are no gaps.
  const runs: { stage: number; points: string }[] = [];
  let start = 0;
  for (let i = 1; i <= pts.length; i++) {
    if (i === pts.length || pts[i].stage !== pts[start].stage) {
      const slice = pts.slice(start, Math.min(i + 1, pts.length));
      runs.push({ stage: pts[start].stage, points: slice.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') });
      start = i;
    }
  }
  const first = pts[0];
  const last = pts[pts.length - 1];

  return (
    <View style={{ height, alignSelf: 'stretch' }} onLayout={onLayout} accessibilityLabel="Route map of this workout">
      {width > 0 ? (
        <Svg width={width} height={height}>
          {runs.map((r, i) => (
            <Polyline
              key={i}
              points={r.points}
              fill="none"
              stroke={phases[r.stage] ? tones[phases[r.stage].tone].accent : colors.textSecondary}
              strokeWidth={phases[r.stage]?.kind === 'work' ? 3.5 : 2.5}
              strokeOpacity={phases[r.stage]?.kind === 'work' ? 1 : 0.7}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          <Circle cx={first.x} cy={first.y} r={4} fill={colors.bg} stroke={colors.text} strokeWidth={2} />
          <Circle cx={last.x} cy={last.y} r={4} fill={colors.text} />
        </Svg>
      ) : null}
    </View>
  );
}
