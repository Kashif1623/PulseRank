import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Loader2, X } from "lucide-react";
import type { ThinkStep } from "./diagnostics";

const T = { ink: "#0f172a", muted: "#475569", subtle: "#94a3b8", border: "rgba(14,165,233,0.25)", accent: "#0284c7" };

function StepIcon({ status }: { status: ThinkStep["status"] }) {
  if (status === "run")  return <Loader2 size={12} className="animate-spin shrink-0" style={{ color: T.accent }} />;
  if (status === "ok")   return <Check size={12} className="shrink-0" style={{ color: "#16a34a" }} />;
  if (status === "warn") return <AlertTriangle size={12} className="shrink-0" style={{ color: "#d97706" }} />;
  return <X size={12} className="shrink-0" style={{ color: "#dc2626" }} />;
}

/**
 * Collapsible "Deep Thinking" box shown above an answer. Every step is something the
 * assistant actually did (a contract read, a log query, a rule check), with its real timing.
 * Open while thinking, collapsed once the answer is ready; click the header to toggle.
 */
export function ThinkingBox({ steps, running, totalMs, usedChain }: {
  steps: ThinkStep[];
  running: boolean;
  totalMs?: number;
  usedChain?: boolean;
}) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? running;

  const title = running
    ? "Thinking…"
    : `🧠 Deep Thinking (${usedChain ? "analyzed contracts & RPC logs" : "reasoned over protocol knowledge"})`;
  const secs = totalMs !== undefined ? `${(totalMs / 1000).toFixed(1)}s` : null;

  return (
    <div className="rounded-xl mb-1.5 overflow-hidden"
         style={{ background: "rgba(241,245,249,0.75)", border: `1px solid ${T.border}` }}>
      <button
        type="button"
        onClick={() => setUserOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 min-h-9 text-left"
      >
        {running
          ? <Loader2 size={13} className="animate-spin shrink-0" style={{ color: T.accent }} />
          : null}
        <span className={`text-xs font-semibold flex-1 min-w-0 ${running ? "animate-pulse" : ""}`} style={{ color: T.muted }}>
          {title}
        </span>
        {secs && !running && <span className="text-xs tabular-nums shrink-0" style={{ color: T.subtle }}>{secs}</span>}
        <ChevronDown size={13} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: T.subtle }} />
      </button>

      {open && (
        <ol className="px-3 pb-2.5 pt-0.5 space-y-1.5" style={{ borderTop: `1px solid ${T.border}` }}>
          {steps.map((s, n) => (
            <li key={n} className="flex items-start gap-2 pt-1.5">
              <span className="mt-0.5"><StepIcon status={s.status} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-xs leading-snug" style={{ color: T.ink }}>{s.label}</div>
                {s.detail && (
                  <div className="text-xs leading-snug break-words [overflow-wrap:anywhere]" style={{ color: T.subtle }}>{s.detail}</div>
                )}
              </div>
              {s.ms !== undefined && s.ms > 0 && (
                <span className="text-xs tabular-nums shrink-0" style={{ color: T.subtle }}>{s.ms}ms</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
