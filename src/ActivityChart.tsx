import { useState, useEffect, useRef, useMemo } from "react";
import type { FeedEvent } from "./ActivityFeed";

const T = {
  ink:    "#0f172a",
  subtle: "#64748b",
  border: "rgba(186,230,253,0.80)",
  grid:   "rgba(186,230,253,0.45)",
};

interface Candle {
  label:    string;
  open:     number;
  high:     number;
  low:      number;
  close:    number;
  volume:   number;
  positive: boolean;
}

const PERIODS   = 12;
const PERIOD_MS = 2 * 60 * 60 * 1000; // 2-hour candles

/**
 * Build candles purely from real feed events.
 * Returns null (empty state) when there are no events at all.
 */
function buildCandlesFromEvents(events: FeedEvent[]): Candle[] | null {
  if (events.length === 0) return null;

  const now    = Date.now();
  const oldest = now - PERIODS * PERIOD_MS;

  // Bucket events into 2-hour windows
  const buckets: { positive: number; negative: number }[] =
    Array.from({ length: PERIODS }, () => ({ positive: 0, negative: 0 }));

  events.forEach(ev => {
    if (ev.ts < oldest) return;
    const age    = now - ev.ts;
    const bucket = Math.min(PERIODS - 1, Math.floor(age / PERIOD_MS));
    const idx    = PERIODS - 1 - bucket; // newest → rightmost
    if (ev.positive) buckets[idx].positive++;
    else             buckets[idx].negative++;
  });

  // Only build candles for buckets that actually have data
  const hasAnyData = buckets.some(b => b.positive + b.negative > 0);
  if (!hasAnyData) return null;

  const candles: Candle[] = [];
  let price = 400; // baseline — represents initial agent score

  for (let i = 0; i < PERIODS; i++) {
    const b     = buckets[i];
    const total = b.positive + b.negative;

    if (total === 0) {
      // Empty bucket: flat doji candle at current price
      const d = new Date(now - (PERIODS - 1 - i) * PERIOD_MS);
      candles.push({
        label:    d.getHours().toString().padStart(2, "0") + ":00",
        open: price, high: price, low: price, close: price,
        volume: 0, positive: true,
      });
    } else {
      const positive = b.positive >= b.negative;
      const swing    = Math.max(2, total * 3);
      const open     = price;
      const close    = positive
        ? Math.min(1000, open + swing)
        : Math.max(0,    open - swing);
      const high     = Math.min(1000, Math.max(open, close) + b.positive * 2);
      const low      = Math.max(0,    Math.min(open, close) - b.negative * 2);
      price = close;

      const d = new Date(now - (PERIODS - 1 - i) * PERIOD_MS);
      candles.push({
        label:    d.getHours().toString().padStart(2, "0") + ":00",
        open, high, low, close,
        volume:   total * 15,
        positive,
      });
    }
  }
  return candles;
}

interface Props {
  events?:      FeedEvent[];
  streamCount?: number;
}

export function ActivityChart({ events = [] }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState({ w: 340, h: 160 });

  useEffect(() => {
    if (!svgRef.current) return;
    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setDims({
        w: entry.contentRect.width,
        h: Math.max(140, entry.contentRect.width * 0.38),
      });
    });
    ro.observe(svgRef.current.parentElement!);
    return () => ro.disconnect();
  }, []);

  const candles = useMemo(() => buildCandlesFromEvents(events), [events]);

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!candles) {
    return (
      <div style={{ width: "100%" }}>
        <div
          className="flex flex-col items-center justify-center rounded-xl"
          style={{
            height: dims.h,
            border: `1px dashed ${T.border}`,
            background: "rgba(186,230,253,0.06)",
          }}
        >
          {/* Flat baseline rule */}
          <svg width="60%" height="24" style={{ display: "block", margin: "0 auto 8px" }}>
            <line x1="0" x2="100%" y1="12" y2="12"
                  stroke={T.border} strokeWidth="1.5" strokeDasharray="4 3" />
            <circle cx="50%" cy="12" r="3" fill={T.border} />
          </svg>
          <p className="text-xs font-medium" style={{ color: T.subtle }}>
            No activity recorded yet
          </p>
          <p className="text-xs mt-0.5" style={{ color: T.border }}>
            Chart updates when heartbeats, tasks or reclaims appear on-chain
          </p>
        </div>

        <div className="flex items-center gap-4 mt-1 px-1">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "#22c55e" }} />
            <span className="text-xs" style={{ color: T.subtle }}>Heartbeat / completed</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "#ef4444" }} />
            <span className="text-xs" style={{ color: T.subtle }}>Reclaim / penalty</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Chart ────────────────────────────────────────────────────────────────────
  const PAD       = { top: 14, right: 12, bottom: 28, left: 40 };
  const chartW    = dims.w - PAD.left - PAD.right;
  const chartH    = dims.h - PAD.top  - PAD.bottom;
  const allPrices = candles.flatMap(c => [c.high, c.low]);
  const priceMin  = Math.max(0,    Math.min(...allPrices) - 15);
  const priceMax  = Math.min(1000, Math.max(...allPrices) + 15);
  const priceRange = priceMax - priceMin || 1;
  const volMax    = Math.max(...candles.map(c => c.volume), 1);
  const n         = candles.length;
  const slotW     = chartW / n;
  const candleW   = Math.max(4, slotW * 0.55);

  function py(p: number) { return PAD.top + chartH - ((p - priceMin) / priceRange) * chartH; }
  function px(i: number) { return PAD.left + (i + 0.5) * slotW; }

  return (
    <div style={{ width: "100%", position: "relative" }}>
      <svg ref={svgRef} width="100%" height={dims.h} viewBox={`0 0 ${dims.w} ${dims.h}`}
           style={{ display: "block", overflow: "visible" }}>

        {/* Grid lines */}
        {Array.from({ length: 4 }, (_, gi) => {
          const gp = priceMin + (priceRange / 3) * gi;
          const gy = py(gp);
          return (
            <g key={gi}>
              <line x1={PAD.left} x2={PAD.left + chartW} y1={gy} y2={gy}
                    stroke={T.grid} strokeWidth={0.8} strokeDasharray="3 3" />
              <text x={PAD.left - 5} y={gy + 3.5} textAnchor="end"
                    fontSize={9} fill={T.subtle}>{Math.round(gp)}</text>
            </g>
          );
        })}

        {/* Volume bars */}
        {candles.map((c, i) => {
          const volH = (c.volume / volMax) * (chartH * 0.22);
          return (
            <rect key={`vol-${i}`}
                  x={px(i) - candleW / 2} y={PAD.top + chartH - volH}
                  width={candleW} height={Math.max(volH, 0)}
                  fill={c.positive ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)"}
                  rx={1.5} />
          );
        })}

        {/* Candles */}
        {candles.map((c, i) => {
          const cx       = px(i);
          const bodyTop  = py(Math.max(c.open, c.close));
          const bodyBot  = py(Math.min(c.open, c.close));
          const bodyH    = Math.max(2, bodyBot - bodyTop);
          const col      = c.positive ? "#22c55e" : "#ef4444";
          const wickCol  = c.positive ? "#16a34a" : "#dc2626";
          return (
            <g key={`c-${i}`}>
              <line x1={cx} x2={cx} y1={py(c.high)} y2={bodyTop}
                    stroke={wickCol} strokeWidth={1.2} />
              <rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={bodyH}
                    fill={col} rx={1.5} opacity={0.92} />
              <line x1={cx} x2={cx} y1={bodyBot} y2={py(c.low)}
                    stroke={wickCol} strokeWidth={1.2} />
            </g>
          );
        })}

        {/* X-axis labels */}
        {candles.map((c, i) => i % 3 === 0 && (
          <text key={`xl-${i}`} x={px(i)} y={dims.h - 4} textAnchor="middle"
                fontSize={8} fill={T.subtle}>{c.label}</text>
        ))}

        {/* Y-axis label */}
        <text x={PAD.left - 28} y={PAD.top + chartH / 2} textAnchor="middle"
              transform={`rotate(-90, ${PAD.left - 28}, ${PAD.top + chartH / 2})`}
              fontSize={8} fill={T.subtle}>Score</text>
      </svg>

      <div className="flex items-center gap-4 mt-1 px-1">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "#22c55e" }} />
          <span className="text-xs" style={{ color: T.subtle }}>Heartbeat / completed</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "#ef4444" }} />
          <span className="text-xs" style={{ color: T.subtle }}>Reclaim / penalty</span>
        </div>
      </div>
    </div>
  );
}
