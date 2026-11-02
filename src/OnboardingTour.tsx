/**
 * OnboardingTour — step-by-step guided tour for first-time visitors.
 * Auto-shows once (localStorage key "pulserank_onboarded").
 * Can also be triggered manually via the exported triggerTour() or the
 * <TourButton /> component in the nav header.
 */

import { useState, useCallback } from "react";
import { X, ChevronRight, ChevronLeft, Zap, User, Wallet, FileText, Trophy } from "lucide-react";

// ── Tour steps ────────────────────────────────────────────────────────────────

interface TourStep {
  icon: React.ReactNode;
  title: string;
  body: string;
  accent: string;
}

const STEPS: TourStep[] = [
  {
    icon: <Trophy size={28} />,
    title: "Welcome to PulseRank",
    accent: "#0284c7",
    body: "PulseRank is an on-chain AI agent monitoring protocol built on Arc Mainnet. Funders stream USDC to agents, agents send heartbeats to prove they're alive, and reputation scores are tracked transparently on-chain.",
  },
  {
    icon: <User size={28} />,
    title: "Register as an Agent",
    accent: "#7c3aed",
    body: "Head to the Agent tab, connect your wallet, and register with a name and minimum daily rate. Your address becomes your on-chain identity. Agents start with a score of 400 (Silver tier) and can earn up to 1000 (Elite).",
  },
  {
    icon: <Wallet size={28} />,
    title: "Create an Escrow Stream",
    accent: "#0891b2",
    body: "Funders open the Funder tab, paste an agent address, choose an amount (≥0.20 USDC), pick a duration in minutes or days, and propose the stream. USDC is locked in escrow until the stream is settled or reclaimed.",
  },
  {
    icon: <Zap size={28} />,
    title: "Heartbeats & Reputation",
    accent: "#16a34a",
    body: "Once a stream is active, the agent sends heartbeats on a schedule (Mode 1: 5 min, Mode 2: 30 min, Mode 3: 1 hr). Each heartbeat earns USDC and increases score. Missed heartbeats let anyone trigger a reclaim and slash 100 score points.",
  },
  {
    icon: <FileText size={28} />,
    title: "Docs & Developer Integration",
    accent: "#d97706",
    body: "Open the Docs tab for deployed contract addresses, ABIs, and code snippets for integrating PulseRank into your app or AI agent. All contracts are verified on Arc Mainnet — no setup needed.",
  },
];

const LS_KEY = "pulserank_onboarded";

// ── Theme ─────────────────────────────────────────────────────────────────────

const T = {
  surface: "rgba(255,255,255,0.97)",
  border:  "rgba(186,230,253,0.80)",
  ink:     "#0f172a",
  subtle:  "#64748b",
  muted:   "#94a3b8",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  /** Force-show (e.g. from "Guided Tour" button) */
  forceOpen?: boolean;
  onClose?: () => void;
}

export function OnboardingTour({ forceOpen = false, onClose }: Props) {
  const [step, setStep] = useState(0);
  // Derive visibility at render time: forced always shows; first-timers see it once
  const isDismissed = !forceOpen && !!localStorage.getItem(LS_KEY);
  const visible = !isDismissed;

  const close = useCallback(() => {
    localStorage.setItem(LS_KEY, "1");
    onClose?.();
  }, [onClose]);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else close();
  }, [step, close]);

  const back = useCallback(() => {
    setStep(s => Math.max(0, s - 1));
  }, []);

  if (!visible) return null;

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 10000, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
        onClick={close}
      />

      {/* Modal */}
      <div
        className="fixed left-1/2 top-1/2 rounded-3xl shadow-2xl flex flex-col"
        style={{
          zIndex:    10001,
          transform: "translate(-50%,-50%)",
          width:     "min(440px, calc(100vw - 32px))",
          background: T.surface,
          border:    `1.5px solid ${T.border}`,
          backdropFilter: "blur(24px)",
          overflow: "hidden",
        }}
      >
        {/* Accent top bar */}
        <div style={{ height: 4, background: `linear-gradient(90deg,${current.accent},${current.accent}88)` }} />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-0">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className="rounded-full transition-all"
                style={{
                  width:      i === step ? 20 : 6,
                  height:     6,
                  background: i === step ? current.accent : "rgba(14,165,233,0.20)",
                }}
              />
            ))}
          </div>
          <button
            onClick={close}
            className="p-1.5 rounded-xl hover:bg-sky-50 transition-colors"
            aria-label="Close tour"
          >
            <X size={14} style={{ color: T.subtle }} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 flex flex-col items-center text-center gap-4">
          {/* Icon */}
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg,${current.accent}22,${current.accent}11)`,
              border:     `1.5px solid ${current.accent}44`,
              color:      current.accent,
              boxShadow:  `0 0 24px ${current.accent}30`,
            }}
          >
            {current.icon}
          </div>

          {/* Text */}
          <div>
            <h2 className="display text-xl font-bold mb-2" style={{ color: T.ink }}>
              {current.title}
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: T.subtle }}>
              {current.body}
            </p>
          </div>

          {/* Step counter */}
          <span className="text-xs font-medium" style={{ color: T.muted }}>
            Step {step + 1} of {STEPS.length}
          </span>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center justify-between gap-3">
          {/* Skip / Back */}
          <div className="flex gap-2">
            {step > 0 ? (
              <button
                onClick={back}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition-colors hover:bg-sky-50"
                style={{ color: T.subtle }}
              >
                <ChevronLeft size={13} /> Back
              </button>
            ) : (
              <button
                onClick={close}
                className="px-3 py-2 rounded-xl text-xs font-semibold transition-colors hover:bg-sky-50"
                style={{ color: T.muted }}
              >
                Skip
              </button>
            )}
          </div>

          {/* Next / Finish */}
          <button
            onClick={next}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:brightness-105 active:scale-95"
            style={{
              background:  `linear-gradient(135deg,${current.accent},${current.accent}cc)`,
              boxShadow:   `0 4px 14px ${current.accent}40`,
            }}
          >
            {isLast ? "Finish" : "Next"}
            {!isLast && <ChevronRight size={14} />}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Trigger button (placed in nav header) ─────────────────────────────────────

interface TourButtonProps { onStart: () => void; }

export function TourButton({ onStart }: TourButtonProps) {
  return (
    <button
      onClick={onStart}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:brightness-105 active:scale-95 shrink-0 whitespace-nowrap"
      style={{
        background: "rgba(2,132,199,0.10)",
        border:     "1px solid rgba(2,132,199,0.25)",
        color:      "#0284c7",
      }}
      aria-label="Start guided tour"
    >
      <Zap size={11} />
      Tour
    </button>
  );
}
