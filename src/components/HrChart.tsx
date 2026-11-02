import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { splitAtGaps, type HrSeries } from '../domain/hrSeries';
import { colors, tones } from '../theme/tokens';

interface Props {
  series: HrSeries;
  height?: number;
  /** Share card: no axis labels, a little more room for the line. */
  compact?: boolean;
}

const LABEL_SIZE = 10;

/**
 * Heart rate over the whole workout. Each stage's target band is shaded in
 * its colour, so it's easy to see how quickly each hard interval got into
 * the zone and how well it held. A break in the line is a sensor dropout or
 * a skipped stretch.
 */
export function HrChart({ series, height = 180, compact = false }: Props) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const { points, stages, maxHr } = series;
  if (points.length === 0) return null;
  const bpms = points.map((p) => p[1]);
  const lows = stages.flatMap((s) => (s.low !== undefined ? [s.low] : []));
  const highs = stages.flatMap((s) => (s.high !== undefined ? [s.high] : []));
  const dataMin = Math.min(...bpms);
  const dataMax = Math.max(...bpms);
  // Keep the work bands and the max line in view, but don't let a far-off band squash the line.
  const yMin = Math.floor((Math.min(dataMin, ...lows.filter((l) => l >= dataMin - 30)) - 4) / 10) * 10;
  const yMax = Math.ceil((Math.max(dataMax, ...highs, maxHr ?? 0) + 4) / 10) * 10;
  const totalSec = Math.max(stages.length ? stages[stages.length - 1].endSec : 0, points[points.length - 1][0] + series.bucketSec);

  const pad = compact ? { l: 2, r: 2, t: 16, b: 4 } : { l: 30, r: 8, t: 18, b: 20 };
  const plotW = Math.max(1, width - pad.l - pad.r);
  const plotH = Math.max(1, height - pad.t - pad.b);
  const x = (sec: number) => pad.l + (sec / totalSec) * plotW;
  const y = (bpm: number) => pad.t + (1 - (Math.max(yMin, Math.min(yMax, bpm)) - yMin) / (yMax - yMin)) * plotH;

  const runs = splitAtGaps(points);
  const step = yMax - yMin > 60 ? 20 : 10;
  const gridLines: number[] = [];
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) gridLines.push(v);
  const minuteStep = totalSec > 50 * 60 ? 15 : totalSec > 20 * 60 ? 10 : 5;
  const minuteTicks: number[] = [];
  for (let m = minuteStep; m * 60 < totalSec; m += minuteStep) minuteTicks.push(m);

  const avg = Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length);

  return (
    <View
      style={{ height, alignSelf: 'stretch' }}
      onLayout={onLayout}
      accessible
      accessibilityLabel={`Heart rate graph. Ranged from ${dataMin} to ${dataMax} beats per minute, averaging about ${avg}.`}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {/* Grid + y labels */}
          {!compact
            ? gridLines.map((v) => (
                <G key={`g${v}`}>
                  <Line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke={colors.hairline} strokeWidth={1} />
                  <SvgText x={pad.l - 6} y={y(v) + 3.5} fontSize={LABEL_SIZE} fill={colors.textTertiary} textAnchor="end">
                    {v}
                  </SvgText>
                </G>
              ))
            : null}

          {/* Target band per stage */}
          {stages.map((s, i) =>
            s.low !== undefined && s.high !== undefined ? (
              <Rect
                key={`b${i}`}
                x={x(s.startSec)}
                width={Math.max(0, x(s.endSec) - x(s.startSec))}
                y={y(s.high)}
                height={Math.max(1, y(s.low) - y(s.high))}
                fill={tones[s.tone].accent}
                fillOpacity={s.kind === 'work' ? 0.24 : 0.11}
              />
            ) : null,
          )}

          {/* Stage dividers + round numbers */}
          {stages.map((s, i) =>
            i > 0 ? (
              <Line
                key={`d${i}`}
                x1={x(s.startSec)}
                x2={x(s.startSec)}
                y1={pad.t}
                y2={pad.t + plotH}
                stroke="rgba(255,255,255,0.10)"
                strokeWidth={1}
              />
            ) : null,
          )}
          {stages.map((s, i) =>
            s.kind === 'work' && s.round !== undefined ? (
              <SvgText
                key={`r${i}`}
                x={(x(s.startSec) + x(s.endSec)) / 2}
                y={pad.t - 6}
                fontSize={LABEL_SIZE}
                fontWeight="600"
                fill={tones[s.tone].accent}
                textAnchor="middle"
              >
                {s.round}
              </SvgText>
            ) : null,
          )}

          {/* Max heart rate reference */}
          {maxHr ? (
            <G>
              <Line
                x1={pad.l}
                x2={width - pad.r}
                y1={y(maxHr)}
                y2={y(maxHr)}
                stroke={colors.textTertiary}
                strokeWidth={1}
                strokeDasharray="3 4"
              />
              {!compact ? (
                <SvgText x={pad.l + 4} y={y(maxHr) - 4} fontSize={LABEL_SIZE} fill={colors.textTertiary}>
                  max {maxHr}
                </SvgText>
              ) : null}
            </G>
          ) : null}

          {/* Heart rate */}
          {runs.map((run, i) =>
            run.length === 1 ? (
              <Rect key={`p${i}`} x={x(run[0][0]) - 1} y={y(run[0][1]) - 1} width={2} height={2} fill={colors.text} />
            ) : (
              <Polyline
                key={`p${i}`}
                points={run.map(([t, bpm]) => `${x(t).toFixed(1)},${y(bpm).toFixed(1)}`).join(' ')}
                fill="none"
                stroke={colors.text}
                strokeWidth={compact ? 2 : 1.6}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ),
          )}

          {/* Minutes */}
          {!compact
            ? minuteTicks.map((m) => (
                <SvgText key={`m${m}`} x={x(m * 60)} y={height - 5} fontSize={LABEL_SIZE} fill={colors.textTertiary} textAnchor="middle">
                  {m === minuteTicks[minuteTicks.length - 1] ? `${m} min` : m}
                </SvgText>
              ))
            : null}
        </Svg>
      ) : null}
    </View>
  );
}
