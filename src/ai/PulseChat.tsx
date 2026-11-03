import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { Send } from "lucide-react";
import { runAssistant, type AssistantReply, type ChatAction, type ThinkStep } from "./engine";
import { ThinkingBox } from "./ThinkingBox";

const ARC_MAINNET_ID = 5042;
const T = {
  accent: "#0284c7", ink: "#0f172a", muted: "#475569", subtle: "#94a3b8",
  border: "rgba(14,165,233,0.20)",
};

interface Msg {
  id: number;
  role: "user" | "ai";
  text: string;
  running?: boolean;
  steps?: ThinkStep[];
  totalMs?: number;
  usedChain?: boolean;
  actions?: ChatAction[];
  suggestions?: string[];
}

const WELCOME: Msg = {
  id: 0,
  role: "ai",
  text: "Assalam o Alaikum! I'm the PulseRank protocol assistant. Ask me how streams, heartbeats, scores or escrow settlement work, in English or Roman Urdu. To check your own agent or stream, say \"scan my wallet\" or \"kya masla aya hai?\" and I'll read Arc Mainnet live.",
};

const QUICK = ["Scan my wallet", "How do heartbeats work?", "Score kaise kaam karta hai?"];

const SEV_STYLE: Record<string, { bg: string; fg: string }> = {
  RED:   { bg: "rgba(239,68,68,0.14)",  fg: "#b91c1c" },
  AMBER: { bg: "rgba(245,158,11,0.16)", fg: "#b45309" },
  OK:    { bg: "rgba(34,197,94,0.14)",  fg: "#15803d" },
  INFO:  { bg: "rgba(14,165,233,0.14)", fg: "#0369a1" },
};

/** **bold** and [RED]/[AMBER]/[OK]/[INFO] tags inside one line. */
function inline(line: string): ReactNode[] {
  return line.split(/(\*\*[^*]+\*\*|\[(?:RED|AMBER|OK|INFO)\])/g).filter(Boolean).map((part, i) => {
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const tag = /^\[(RED|AMBER|OK|INFO)\]$/.exec(part);
    if (tag) {
      const s = SEV_STYLE[tag[1]];
      return (
        <span key={i} className="inline-block text-[10px] font-bold px-1.5 py-px rounded-full mr-1 align-middle"
              style={{ background: s.bg, color: s.fg }}>{tag[1]}</span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-1" dir="auto">
      {text.split("\n").map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        const bullet = /^- (.*)/.exec(line);
        const numbered = /^(\d+)\. (.*)/.exec(line);
        if (bullet) return <div key={i} className="flex gap-1.5"><span>•</span><span className="min-w-0 break-words">{inline(bullet[1])}</span></div>;
        if (numbered) return <div key={i} className="flex gap-1.5"><span className="tabular-nums">{numbered[1]}.</span><span className="min-w-0 break-words">{inline(numbered[2])}</span></div>;
        return <div key={i} className="break-words">{inline(line)}</div>;
      })}
    </div>
  );
}

export function PulseChat({ onNavigate }: { onNavigate?: () => void }) {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: ARC_MAINNET_ID });
  const [msgs, setMsgs] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);

  const ask = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    const userId = nextId.current++;
    const aiId = nextId.current++;
    setMsgs(prev => [...prev, { id: userId, role: "user", text: q }, { id: aiId, role: "ai", text: "", running: true, steps: [] }]);
    setInput("");
    setBusy(true);
    const patch = (p: Partial<Msg>) => setMsgs(prev => prev.map(m => (m.id === aiId ? { ...m, ...p } : m)));
    try {
      const reply: AssistantReply = await runAssistant(
        q,
        { wallet: address, walletChainId: chainId, client: client },
        steps => patch({ steps }),
      );
      patch({
        running: false, text: reply.text, steps: reply.steps, totalMs: reply.totalMs,
        usedChain: reply.usedChain, actions: reply.actions, suggestions: reply.suggestions,
      });
    } catch {
      patch({ running: false, text: "Something went wrong while I was thinking. Please try again.", usedChain: false });
    } finally {
      setBusy(false);
    }
  }, [address, chainId, client, busy]);

  const go = (a: ChatAction) => {
    window.dispatchEvent(new CustomEvent("pulserank:navigate", { detail: a.tab }));
    onNavigate?.();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-1" style={{ maxHeight: "min(340px, 42vh)" }} aria-live="polite">
        {msgs.map(m => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={m.role === "user" ? "max-w-[85%]" : "max-w-[94%] w-full"}>
              {m.role === "ai" && m.steps && m.steps.length > 0 && (
                <ThinkingBox steps={m.steps} running={!!m.running} totalMs={m.totalMs} usedChain={m.usedChain} />
              )}
              {(m.role === "user" || m.text) && (
                <div className="text-xs px-3 py-2 rounded-2xl"
                  style={{
                    background: m.role === "user" ? `linear-gradient(135deg,${T.accent},#0ea5e9)` : "rgba(255,255,255,0.85)",
                    color: m.role === "user" ? "#fff" : T.ink,
                    border: m.role === "ai" ? `1px solid ${T.border}` : "none",
                  }}>
                  {m.role === "user" ? <span dir="auto" className="break-words">{m.text}</span> : <RichText text={m.text} />}
                </div>
              )}
              {m.actions && m.actions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {m.actions.map(a => (
                    <button key={a.tab} onClick={() => go(a)}
                      className="text-xs font-semibold px-3 min-h-9 rounded-xl text-white"
                      style={{ background: `linear-gradient(135deg,${T.accent},#0ea5e9)` }}>
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
              {m.suggestions && m.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {m.suggestions.map(s => (
                    <button key={s} onClick={() => { void ask(s); }} disabled={busy}
                      className="text-xs px-2.5 min-h-8 rounded-full disabled:opacity-50"
                      style={{ border: `1px solid ${T.border}`, color: T.accent, background: "rgba(240,249,255,0.8)" }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {msgs.length === 1 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {QUICK.map(s => (
            <button key={s} onClick={() => { void ask(s); }} disabled={busy}
              className="text-xs px-2.5 min-h-8 rounded-full disabled:opacity-50"
              style={{ border: `1px solid ${T.border}`, color: T.accent, background: "rgba(240,249,255,0.8)" }}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") void ask(input); }}
          placeholder="Ask in English, Roman Urdu, or Urdu…"
          disabled={busy}
          aria-label="Message PulseRank AI"
          className="flex-1 text-xs rounded-xl px-3 py-2 outline-none disabled:opacity-60"
          style={{ background: "rgba(240,249,255,0.8)", border: `1px solid ${T.border}`, color: T.ink }}
        />
        <button onClick={() => { void ask(input); }} disabled={busy || !input.trim()}
          aria-label="Send"
          className="p-2 rounded-xl text-white transition-opacity disabled:opacity-50"
          style={{ background: `linear-gradient(135deg,${T.accent},#0ea5e9)` }}>
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}
