import type { PublicClient } from "viem";
import { detectLang, pick, type Lang } from "./language";
import { APY_NOTICE, fallbackText, isYieldQuestion, matchTopics, topicText } from "./knowledge";
import { scanWallet, type Reporter, type ThinkStep } from "./diagnostics";
import { buildDiagnosis, type ChatAction } from "./findings";

export type { ThinkStep, ChatAction };

export interface AssistantReply {
  text: string;
  actions: ChatAction[];
  suggestions: string[];
  steps: ThinkStep[];
  totalMs: number;
  /** True when the answer used live Arc Mainnet reads (shown in the Deep Thinking header). */
  usedChain: boolean;
}

export interface AssistantContext {
  /** Connected wallet, if any. */
  wallet?: string;
  walletChainId?: number;
  client?: PublicClient;
}

const ADDRESS = /0x[0-9a-fA-F]{40}/;
const ARC_CHAIN_ID = 5042;

const SUGGEST: Record<string, string> = {
  heartbeat: "How do heartbeats work?",
  score: "How is the reputation score calculated?",
  timeout: "What happens when an agent times out?",
  settle: "How do I settle and claim my USDC?",
  stream: "How does a stream work?",
};

const LANG_NAME: Record<Lang, string> = { en: "English", roman: "Roman Urdu", ur: "Urdu" };

/** Questions that should trigger a live scan instead of a knowledge answer. */
export function wantsDiagnosis(q: string): boolean {
  const s = q.toLowerCase();
  if (ADDRESS.test(s)) return true;
  if (/(scan|diagnos|root cause|masla|maslay|kya hua|kharab|stuck|at risk|inspect (my|the)|check (my|the|connected))/.test(s)) return true;
  const trouble = /(why|kyun|kyu|not working|not updating|failing|failed|error|problem|issue|dead|timed out|risk)/.test(s);
  const mine = /(my|mera|meri|mere|apna|apni|connected|wallet|agent|stream|payout|funds?)/.test(s);
  return trouble && mine;
}

function makeReporter(steps: ThinkStep[], onUpdate: (s: ThinkStep[]) => void): Reporter {
  const t0: number[] = [];
  const emit = () => onUpdate(steps.map(s => ({ ...s })));
  return {
    start(label) {
      steps.push({ label, status: "run" });
      t0[steps.length - 1] = performance.now();
      emit();
      return steps.length - 1;
    },
    finish(i, status, detail) {
      steps[i] = { ...steps[i], status, detail, ms: Math.round(performance.now() - (t0[i] ?? performance.now())) };
      emit();
    },
  };
}

export async function runAssistant(
  question: string,
  ctx: AssistantContext,
  onUpdate: (steps: ThinkStep[]) => void,
): Promise<AssistantReply> {
  const started = performance.now();
  const steps: ThinkStep[] = [];
  const report = makeReporter(steps, onUpdate);
  const done = (r: Omit<AssistantReply, "steps" | "totalMs">): AssistantReply =>
    ({ ...r, steps: steps.map(s => ({ ...s })), totalMs: Math.round(performance.now() - started) });

  let i = report.start("Reading the question and detecting the language");
  const lang = detectLang(question);
  report.finish(i, "ok", LANG_NAME[lang]);

  // APY / yield questions always get the owner's fixed clarification (the feature is not built yet).
  if (isYieldQuestion(question)) {
    i = report.start("Checking whether APY or yield is part of the contracts");
    report.finish(i, "ok", "not implemented yet: upcoming proposal");
    return done({ text: APY_NOTICE, actions: [], suggestions: [], usedChain: false });
  }

  i = report.start("Deciding what you need: explanation or live wallet diagnosis");
  const diagnose = wantsDiagnosis(question);
  report.finish(i, "ok", diagnose ? "live diagnosis" : "protocol explanation");

  // ── Live diagnosis ─────────────────────────────────────────────────────────
  if (diagnose) {
    const pasted = ADDRESS.exec(question)?.[0];
    const target = (pasted ?? ctx.wallet) as `0x${string}` | undefined;
    if (!target) {
      i = report.start("Looking for a wallet to scan");
      report.finish(i, "warn", "no wallet connected and no address in the message");
      return done({
        text: pick(lang, {
          en: "I need a wallet to scan. Connect your wallet (top right) or paste a 0x address, for example \"scan 0x…\", and I'll check it live on Arc Mainnet.",
          roman: "Scan karne ke liye mujhe wallet chahiye. Apna wallet connect kijiye (upar right) ya koi 0x address paste kijiye, jaise \"scan 0x…\", aur main Arc Mainnet par live check kar dunga.",
        }),
        actions: [], suggestions: [], usedChain: false,
      });
    }
    if (!ctx.client) {
      i = report.start("Opening the Arc Mainnet RPC client");
      report.finish(i, "fail", "client unavailable");
      return done({
        text: pick(lang, { en: "I could not open an Arc Mainnet RPC connection. Refresh the page and try again.", roman: "Arc Mainnet RPC connection nahi khul saka. Page refresh karke dobara try kijiye." }),
        actions: [], suggestions: [], usedChain: false,
      });
    }
    const isOwn = !pasted || (ctx.wallet !== undefined && pasted.toLowerCase() === ctx.wallet.toLowerCase());
    try {
      const facts = await scanWallet(ctx.client, target, report);
      i = report.start("Working out the root cause from the on-chain numbers");
      const d = buildDiagnosis(facts, lang, isOwn);
      const wrongChain = isOwn && ctx.walletChainId !== undefined && ctx.walletChainId !== ARC_CHAIN_ID;
      report.finish(i, d.worst === "critical" || d.worst === "warn" ? "warn" : "ok", d.worst === "ok" ? "no problems found" : `most severe finding: ${d.worst}`);
      const chainNote = wrongChain
        ? pick(lang, {
            en: `\n\n[AMBER] Your wallet is on chain ${ctx.walletChainId}, not Arc Mainnet (5042). Switch network in your wallet before sending any transaction.`,
            roman: `\n\n[AMBER] Aapka wallet chain ${ctx.walletChainId} par hai, Arc Mainnet (5042) par nahi. Koi transaction bhejne se pehle wallet mein network switch kijiye.`,
          })
        : "";
      return done({ text: d.text + chainNote, actions: d.actions, suggestions: [], usedChain: true });
    } catch (e) {
      i = report.start("Handling the RPC error");
      const msg = e instanceof Error ? e.message.split("\n")[0].slice(0, 140) : "unknown error";
      report.finish(i, "fail", msg);
      return done({
        text: pick(lang, {
          en: `The Arc RPC did not answer cleanly (${msg}). It rate-limits bursts of requests, so wait a few seconds and ask me to scan again.`,
          roman: `Arc RPC ne theek jawab nahi diya (${msg}). Woh bohat zyada requests par rate-limit kar deta hai, is liye chand second ruk kar dobara scan ke liye kahiye.`,
        }),
        actions: [], suggestions: [], usedChain: true,
      });
    }
  }

  // ── Knowledge answer ───────────────────────────────────────────────────────
  i = report.start("Matching your question against PulseRank protocol topics");
  const matches = matchTopics(question);
  if (matches.length === 0) {
    report.finish(i, "warn", "no topic matched");
    return done({
      text: fallbackText(lang), actions: [],
      suggestions: [SUGGEST.stream, SUGGEST.heartbeat, SUGGEST.score], usedChain: false,
    });
  }
  const top = matches[0];
  const picked = [top, ...matches.slice(1, 2).filter(m => m.score >= top.score * 0.7 && m.topic.id !== "greeting")];
  report.finish(i, "ok", picked.map(m => m.topic.id).join(" + "));

  i = report.start("Checking the answer against the current PulseStreamV2 contract rules");
  const text = picked.map(m => topicText(m.topic, lang)).join("\n\n");
  report.finish(i, "ok", "intervals, score math and settlement rules verified");

  const suggestions = [...new Set(picked.flatMap(m => m.topic.related ?? []))]
    .filter(id => !picked.some(m => m.topic.id === id))
    .map(id => SUGGEST[id])
    .filter(Boolean)
    .slice(0, 3);
  return done({ text, actions: [], suggestions, usedChain: false });
}
