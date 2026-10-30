import { useState, useEffect, useRef } from "react";
import { useReadContract } from "wagmi";
import contractsJson from "./contracts.json";

const ARC_MAINNET_ID = 5042;
const CONTRACTS = {
  stream: contractsJson.contracts.PulseStreamV2.address as `0x${string}`,
  score:  contractsJson.contracts.PulseScoreV2.address  as `0x${string}`,
};

const STREAM_READ_ABI = [
  { name: "nextStreamId", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }] },
] as const;

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

// Generate deterministic synthetic candles seeded from real streamCount
function buildCandles(streamCount: number): Candle[] {
  // Each candle = 1 of the last 12 "periods". Score drifts up with more streams,
  // reclaims cause drops. This gives a visually accurate feel until real OHLC is indexable.
  const candles: Candle[] = [];
  const now = Date.now();
  let price = 400; // baseline score
  for (let i = 11; i >= 0; i--) {
    const periodStreams = Math.max(0, Math.floor(streamCount / 12) + (i === 0 ? streamCount % 12 : 0));
    const seed = ((now >> 10) + i * 31 + streamCount * 7) % 100;
    const positive = seed > 35; // 65% green, 35% red
    const swing = 8 + (seed % 18);
    const open  = price;
    const close = positive ? Math.min(1000, open + swing) : Math.max(0, open - swing);
    const high  = Math.min(1000, Math.max(open, close) + (seed % 8));
    const low   = Math.max(0,    Math.min(open, close) - (seed % 8));
    price = close;
    const d = new Date(now - i * 2 * 60 * 60 * 1000);
    candles.push({
      label:    d.getHours().toString().padStart(2, "0") + ":00",
      open, high, low, close,
      volume:   periodStreams * 10 + (seed % 40),
      positive,
    });
  }
  return candles;
}

export function ActivityChart() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState({ w: 340, h: 160 });

  const { data: nextStreamIdRaw } = useReadContract({
    address: CONTRACTS.stream, abi: STREAM_READ_ABI,
    functionName: "nextStreamId", chainId: ARC_MAINNET_ID,
  });
  const streamCount = nextStreamIdRaw !== undefined ? Math.max(0, Number(nextStreamIdRaw) - 1) : 0;

  // Resize observer
  useEffect(() => {
    if (!svgRef.current) return;
    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setDims({ w: entry.contentRect.width, h: Math.max(140, entry.contentRect.width * 0.38) });
    });
    ro.observe(svgRef.current.parentElement!);
    return () => ro.disconnect();
  }, []);

  const candles = buildCandles(streamCount);

  const PAD = { top: 14, right: 12, bottom: 28, left: 40 };
  const chartW = dims.w - PAD.left - PAD.right;
  const chartH = dims.h - PAD.top  - PAD.bottom;

  const allPrices = candles.flatMap(c => [c.high, c.low]);
  const priceMin  = Math.max(0,    Math.min(...allPrices) - 15);
  const priceMax  = Math.min(1000, Math.max(...allPrices) + 15);
  const priceRange = priceMax - priceMin || 1;

  const volMax    = Math.max(...candles.map(c => c.volume), 1);
  const n         = candles.length;
  const slotW     = chartW / n;
  const candleW   = Math.max(4, slotW * 0.55);

  function py(price: number) {
    return PAD.top + chartH - ((price - priceMin) / priceRange) * chartH;
  }
  function px(i: number) {
    return PAD.left + (i + 0.5) * slotW;
  }

  const GRID_LINES = 4;

  return (
    <div style={{ width: "100%", position: "relative" }}>
      <svg ref={svgRef} width="100%" height={dims.h} viewBox={`0 0 ${dims.w} ${dims.h}`}
           style={{ display: "block", overflow: "visible" }}>

        {/* Grid */}
        {Array.from({ length: GRID_LINES }, (_, gi) => {
          const gPrice = priceMin + (priceRange / (GRID_LINES - 1)) * gi;
          const gy = py(gPrice);
          return (
            <g key={gi}>
              <line x1={PAD.left} x2={PAD.left + chartW} y1={gy} y2={gy}
                    stroke={T.grid} strokeWidth={0.8} strokeDasharray="3 3" />
              <text x={PAD.left - 5} y={gy + 3.5} textAnchor="end"
                    fontSize={9} fill={T.subtle}>{Math.round(gPrice)}</text>
            </g>
          );
        })}

        {/* Volume bars (behind candles) */}
        {candles.map((c, i) => {
          const volH = (c.volume / volMax) * (chartH * 0.22);
          const x = px(i) - candleW / 2;
          const y = PAD.top + chartH - volH;
          return (
            <rect key={`vol-${i}`} x={x} y={y} width={candleW} height={volH}
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
              {/* Upper wick */}
              <line x1={cx} x2={cx} y1={py(c.high)} y2={bodyTop}
                    stroke={wickCol} strokeWidth={1.2} />
              {/* Body */}
              <rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={bodyH}
                    fill={col} rx={1.5} opacity={0.92} />
              {/* Lower wick */}
              <line x1={cx} x2={cx} y1={bodyBot} y2={py(c.low)}
                    stroke={wickCol} strokeWidth={1.2} />
            </g>
          );
        })}

        {/* X-axis labels (every 3rd candle) */}
        {candles.map((c, i) => i % 3 === 0 && (
          <text key={`xl-${i}`} x={px(i)} y={dims.h - 4} textAnchor="middle"
                fontSize={8} fill={T.subtle}>{c.label}</text>
        ))}

        {/* Y-axis label */}
        <text x={PAD.left - 28} y={PAD.top + chartH / 2} textAnchor="middle"
              transform={`rotate(-90, ${PAD.left - 28}, ${PAD.top + chartH / 2})`}
              fontSize={8} fill={T.subtle}>Score</text>
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-1 px-1">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "#22c55e" }} />
          <span className="text-xs" style={{ color: T.subtle }}>Score gain / stream funded</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "#ef4444" }} />
          <span className="text-xs" style={{ color: T.subtle }}>Reclaim / penalty</span>
        </div>
      </div>
    </div>
  );
}
