import type { ReactNode } from 'react';

/** A stat tile: sentence-case label, a compact value, an optional context line
 * and an optional trend. The single view hero uses the `hero` variant. */
export function KpiTile({
  label,
  value,
  sub,
  trend,
  hero,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: ReactNode;
  hero?: boolean;
}) {
  return (
    <div className={hero ? 'kpi kpi-hero' : 'kpi'}>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      {sub ? <p className="kpi-sub">{sub}</p> : null}
      {trend ? <div className="kpi-trend">{trend}</div> : null}
    </div>
  );
}

interface Pt {
  x: number;
  y: number;
}

/** A tiny trend line. One series, so no legend; the aria-label names it. */
export function Sparkline({
  values,
  width = 132,
  height = 40,
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  label: string;
}) {
  const max = Math.max(1, ...values);
  const n = values.length;
  const pad = 4;
  const pts: Pt[] = values.map((v, i) => ({
    x: n > 1 ? (i * width) / (n - 1) : width / 2,
    y: height - pad - (v / max) * (height - 2 * pad),
  }));
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const first = pts[0];
  const last = pts[pts.length - 1];
  const area = `${(first?.x ?? 0).toFixed(1)},${height} ${line} ${(last?.x ?? width).toFixed(1)},${height}`;
  return (
    <svg
      className="spark"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <polyline className="spark-area" points={area} />
      <polyline className="spark-line" points={line} />
      {last ? <circle className="spark-dot" cx={last.x} cy={last.y} r={4} /> : null}
    </svg>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
  sub?: string;
}

/** Horizontal bars in plain HTML, so every value is real text beside its mark
 * (this is the relief the light-mode palette needs) and it reads on a screen
 * reader with no extra work. */
export function BarChart({
  data,
  format,
  max,
}: {
  data: BarDatum[];
  format?: (n: number) => string;
  max?: number;
}) {
  const m = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="barchart">
      {data.map((d) => (
        <li className="bar-row" key={d.label}>
          <span className="bar-label" title={d.label}>
            {d.label}
            {d.sub ? <span className="bar-sub">{d.sub}</span> : null}
          </span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${(d.value / m) * 100}%`, background: d.color ?? 'var(--series-1)' }}
            />
          </span>
          <span className="bar-value">{format ? format(d.value) : d.value}</span>
        </li>
      ))}
    </ul>
  );
}

export type MeterTone = 'good' | 'warning' | 'critical' | 'info';

/** A single proportion meter: the fill carries state, the track is a lighter
 * step of the same ramp so the level reads across the whole bar. */
export function Meter({
  value,
  max = 100,
  tone = 'good',
  label,
  valueText,
}: {
  value: number;
  max?: number;
  tone?: MeterTone;
  label: string;
  valueText?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const shown = valueText ?? `${Math.round(pct)}%`;
  return (
    <div className="meter" role="img" aria-label={`${label}: ${shown}`}>
      <div className="meter-head">
        <span>{label}</span>
        <span className="meter-value">{shown}</span>
      </div>
      <div className="meter-track">
        <div className={`meter-fill tone-${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export interface Segment {
  label: string;
  value: number;
  tone: string;
}

/** A segmented proportion bar with a 2px surface gap between fills and a legend
 * that is always present, so identity never rests on color alone. */
export function SegmentBar({ segments, label }: { segments: Segment[]; label: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="segbar-wrap">
      <div className="segbar" role="img" aria-label={label}>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <span
              className={`seg seg-${s.tone}`}
              key={s.label}
              style={{ flexGrow: s.value }}
              title={`${s.label}: ${s.value}`}
            />
          ))}
      </div>
      <ul className="seg-legend">
        {segments.map((s) => (
          <li key={s.label}>
            <span className={`seg-key seg-${s.tone}`} aria-hidden="true" />
            <span className="seg-name">{s.label}</span>
            <b>{s.value}</b>
            <span className="seg-pct">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
