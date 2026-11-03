import { pick, type Lang } from "./language";
import type { StreamFacts, WalletFacts } from "./diagnostics";

export type TabId = "leaderboard" | "funder" | "agent" | "docs";
export interface ChatAction { label: string; tab: TabId }

type Sev = "critical" | "warn" | "info" | "ok";
interface Finding {
  sev: Sev;
  /** Plain statement of what is wrong (or fine), with the real numbers. */
  cause: { en: string; roman: string };
  /** Ordered fix steps. */
  fix?: { en: string; roman: string }[];
  action?: ChatAction;
}

const ORDER: Record<Sev, number> = { critical: 0, warn: 1, info: 2, ok: 3 };
const ICON: Record<Sev, string> = { critical: "RED", warn: "AMBER", info: "INFO", ok: "OK" };

export const usd = (n: bigint) => `$${(Number(n) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function dur(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return m ? `${h}h ${m}m` : `${h}h`; }
  return `${+(s / 86400).toFixed(1)} days`;
}

const MODE = ["", "Strict", "Normal", "Relaxed"];

function streamFindings(s: StreamFacts, w: WalletFacts): Finding[] {
  const out: Finding[] = [];
  const tag = `Stream #${s.id}`;
  const amount = usd(s.total);
  const hb = s.heartbeats === null ? null : `${s.heartbeatsPartial ? "at least " : ""}${s.heartbeats}`;
  const agentGoTo: ChatAction = { label: "Open Agent tab", tab: "agent" };
  const funderGoTo: ChatAction = { label: "Open Funder tab", tab: "funder" };

  if (s.status === 0) {
    if (s.asAgent) out.push({
      sev: "warn",
      cause: {
        en: `${tag} (${amount}) is still Proposed: the funder has locked the USDC, but this wallet has not accepted it. Nothing accrues and no heartbeat is expected until you accept.`,
        roman: `${tag} (${amount}) abhi Proposed hai: funder ne USDC lock kar di hai, lekin is wallet ne accept nahi ki. Jab tak accept na ho, na kuch accrue hota hai na heartbeat chahiye.`,
      },
      fix: [
        { en: "Open the Agent tab with this same wallet connected.", roman: "Isi wallet ko connect karke Agent tab kholiye." },
        { en: `Press Accept Stream on ${tag} and confirm in your wallet. The clock starts and your score is set to 400 on your first accepted stream.`, roman: `${tag} par Accept Stream dabaiye aur wallet mein confirm kijiye. Clock shuru hogi aur pehli accepted stream par score 400 ho jayega.` },
      ],
      action: agentGoTo,
    });
    if (s.asFunder && !s.asAgent) out.push({
      sev: "warn",
      cause: {
        en: `${tag} (${amount}) is waiting for the agent ${s.agent.slice(0, 6)}…${s.agent.slice(-4)} to accept. Your USDC is in escrow and nothing is accruing.`,
        roman: `${tag} (${amount}) agent ${s.agent.slice(0, 6)}…${s.agent.slice(-4)} ke accept karne ka intezar kar rahi hai. Aapki USDC escrow mein hai aur kuch accrue nahi ho raha.`,
      },
      fix: [
        { en: "Ask the agent to open the Agent tab and press Accept Stream from the agent wallet.", roman: "Agent se kahiye ke apne wallet se Agent tab mein Accept Stream dabaye." },
        { en: "If it will not accept, cancel the proposal to get the USDC back (cancelProposal on the Stream contract).", roman: "Agar accept na kare to proposal cancel karke USDC wapas le lijiye (Stream contract par cancelProposal)." },
      ],
      action: funderGoTo,
    });
    return out;
  }

  if (s.status === 1) {
    const missed = s.interval > 0 ? Math.floor(s.sinceHeartbeat / s.interval) : 0;
    const window = s.interval + s.grace;
    if (s.ended) {
      out.push({
        sev: "warn",
        cause: {
          en: `${tag} has run its full ${dur(s.durationSecs)}. It is still marked Active until someone settles it, and while it is Active a keeper can still reclaim it if heartbeats look stale (${dur(s.sinceHeartbeat)} since the last one).`,
          roman: `${tag} ne apni poori ${dur(s.durationSecs)} chala li hai. Jab tak koi settle na kare yeh Active hi rehti hai, aur Active hone par agar heartbeats purani hon (${dur(s.sinceHeartbeat)} pehle ki) to keeper reclaim bhi kar sakta hai.`,
        },
        fix: [
          { en: "Open the Agent (or Funder) tab and press Settle on the finished stream, then confirm.", roman: "Agent (ya Funder) tab kholiye aur khatam hui stream par Settle dabaiye, phir confirm kijiye." },
          { en: "After it shows Completed, press Claim Payout to withdraw the USDC to your wallet.", roman: "Completed dikhne ke baad Claim Payout dabaiye taake USDC wallet mein aa jaye." },
        ],
        action: s.asAgent ? agentGoTo : funderGoTo,
      });
      return out;
    }
    if (s.timedOut) {
      out.push({
        sev: "critical",
        cause: {
          en: `${tag} is TIMED OUT. The last heartbeat was ${dur(s.sinceHeartbeat)} ago, but a ${MODE[s.mode] ?? "this"} stream allows only ${dur(s.interval)} + ${dur(s.grace)} grace = ${dur(window)}. About ${missed} heartbeat interval${missed === 1 ? "" : "s"} were missed. ${hb !== null ? `${hb} heartbeat${hb === "1" ? "" : "s"} were recorded onchain in total.` : ""} Anyone can reclaim the unearned ${usd(s.total - s.earned)} now, and if that happens the agent's score drops by 100.`,
          roman: `${tag} TIMED OUT hai. Aakhri heartbeat ${dur(s.sinceHeartbeat)} pehle thi, jabke ${MODE[s.mode] ?? "is"} stream sirf ${dur(s.interval)} + ${dur(s.grace)} grace = ${dur(window)} deti hai. Taqreeban ${missed} heartbeat interval miss hue. ${hb !== null ? `Onchain kul ${hb} heartbeat record hui.` : ""} Ab koi bhi unearned ${usd(s.total - s.earned)} reclaim kar sakta hai, aur aisa hua to agent ka score 100 kam ho jayega.`,
        },
        fix: s.asAgent ? [
          { en: "Send a heartbeat immediately: Agent tab, press Send Manual Heartbeat. It is accepted until someone actually reclaims the stream, and it resets the clock.", roman: "Foran heartbeat bhejiye: Agent tab mein Send Manual Heartbeat dabaiye. Jab tak koi stream reclaim na kare yeh qabool hoti hai aur clock reset kar deti hai." },
          { en: "Next time, send one every interval (set a reminder shorter than the interval).", roman: "Aainda har interval par ek bhejiye (interval se chhota reminder lagaiye)." },
        ] : [
          { en: "Recover the unearned USDC: Funder tab, press Reclaim on this stream (cancelTimedOutStream). The agent keeps what it earned, 5% of the rest is the penalty, you get the remainder.", roman: "Unearned USDC wapas lijiye: Funder tab mein is stream par Reclaim dabaiye (cancelTimedOutStream). Agent ko earned milta hai, baqi ka 5% penalty, aur baqi aapko." },
        ],
        action: s.asAgent ? agentGoTo : funderGoTo,
      });
      return out;
    }
    const dueIn = s.lastHeartbeat + s.interval - w.nowSec;
    const shorter = s.durationSecs < s.interval;
    out.push({
      sev: "ok",
      cause: {
        en: `${tag} is Active and healthy: ${dur(s.elapsed)} of ${dur(s.durationSecs)} elapsed, ${usd(s.earned)} of ${amount} recorded. ${shorter
          ? `Its duration is shorter than the ${MODE[s.mode]} heartbeat interval (${dur(s.interval)}), so no heartbeat can be recorded; that is by design and it simply runs to its end.`
          : `${hb !== null ? `${hb} heartbeat${hb === "1" ? "" : "s"} recorded. ` : ""}${dueIn > 0 ? `Next heartbeat can be sent in ${dur(dueIn)}` : "A heartbeat can be sent right now"}, and the stream times out if none arrives within ${dur(window - s.sinceHeartbeat)}.`}`,
        roman: `${tag} Active aur theek hai: ${dur(s.durationSecs)} mein se ${dur(s.elapsed)} guzar chuke, ${amount} mein se ${usd(s.earned)} record hui. ${shorter
          ? `Iski duration ${MODE[s.mode]} heartbeat interval (${dur(s.interval)}) se chhoti hai, is liye koi heartbeat record nahi ho sakti; yeh design ke mutabiq hai aur stream seedha end tak chalegi.`
          : `${hb !== null ? `${hb} heartbeat record hui. ` : ""}${dueIn > 0 ? `Agli heartbeat ${dur(dueIn)} mein bheji ja sakti hai` : "Heartbeat abhi bheji ja sakti hai"}, aur ${dur(window - s.sinceHeartbeat)} mein na aaye to stream timeout ho jayegi.`}`,
      },
      fix: s.asAgent && !shorter && dueIn <= 0 ? [
        { en: "Agent tab: press Send Manual Heartbeat now.", roman: "Agent tab mein abhi Send Manual Heartbeat dabaiye." },
      ] : undefined,
      action: s.asAgent && !shorter && dueIn <= 0 ? agentGoTo : undefined,
    });
    if (s.asAgent && s.total - s.earned < 1_000_000n) {
      out.push({
        sev: "info",
        cause: {
          en: `Score note for ${tag}: heartbeats only add +1 while at least 1 USDC of the stream is still unearned. Only ${usd(s.total - s.earned)} is left unearned here, so heartbeats on this stream will not raise your score.`,
          roman: `${tag} ke liye score note: heartbeat sirf tab +1 deti hai jab stream ki kam az kam 1 USDC unearned ho. Yahan sirf ${usd(s.total - s.earned)} unearned bachi hai, is liye is stream ki heartbeats score nahi barhayengi.`,
        },
      });
    }
    return out;
  }

  if (s.status === 2) out.push({
    sev: "info",
    cause: { en: `${tag} is Paused by the funder, so nothing accrues until it is unpaused.`, roman: `${tag} funder ne Pause ki hui hai, is liye unpause hone tak kuch accrue nahi hota.` },
  });
  if (s.status === 3) {
    const left = w.pending > 0n;
    out.push({
      sev: "ok",
      cause: {
        en: `${tag} is Completed: ${usd(s.earned)} was credited to the agent and ${usd(s.total - s.earned)} to the funder. ${left ? "Some of it is still waiting in pending payouts." : "Nothing is left to claim on this wallet."}`,
        roman: `${tag} Completed hai: ${usd(s.earned)} agent ko aur ${usd(s.total - s.earned)} funder ko credit hui. ${left ? "Kuch hissa abhi pending payouts mein pada hai." : "Is wallet par claim karne ko kuch nahi bacha."}`,
      },
    });
  }
  if (s.status === 4) out.push({
    sev: "info",
    cause: { en: `${tag} was Reclaimed (stopped early): ${usd(s.earned)} earned by the agent, ${usd(s.total - s.earned)} returned to the funder side.`, roman: `${tag} Reclaimed (jaldi roki gayi) hai: agent ne ${usd(s.earned)} earn ki, ${usd(s.total - s.earned)} funder ki taraf wapas gayi.` },
  });
  if (s.status === 5) out.push({
    sev: "info",
    cause: { en: `${tag} was Cancelled before the agent accepted; the funder got the USDC back.`, roman: `${tag} agent ke accept karne se pehle Cancel ho gayi; funder ko USDC wapas mili.` },
  });
  return out;
}

function walletFindings(w: WalletFacts): Finding[] {
  const out: Finding[] = [];
  if (w.pending > 0n) out.push({
    sev: "warn",
    cause: { en: `${usd(w.pending)} USDC is waiting in this wallet's pending payout balance. It stays in the contract until you withdraw it.`, roman: `Is wallet ke pending payout balance mein ${usd(w.pending)} USDC pari hai. Jab tak aap withdraw na karein yeh contract mein rehti hai.` },
    fix: [
      { en: "Open the Agent (or Funder) tab and press Claim Payout.", roman: "Agent (ya Funder) tab kholiye aur Claim Payout dabaiye." },
      { en: "Confirm in your wallet; the USDC arrives in the same block or the next.", roman: "Wallet mein confirm kijiye; USDC usi block ya agle block mein aa jati hai." },
    ],
    action: { label: "Open Agent tab", tab: "agent" },
  });
  if (w.gasBalance !== null && w.gasBalance < 10n ** 16n) out.push({
    sev: "warn",
    cause: { en: `This wallet holds under 0.01 USDC for gas. On Arc, gas is paid in USDC, so transactions may fail or never confirm.`, roman: `Is wallet mein gas ke liye 0.01 USDC se kam hai. Arc par gas USDC mein jati hai, is liye transactions fail ho sakti hain ya confirm nahi hongi.` },
    fix: [{ en: "Top up the wallet with a little USDC on Arc Mainnet, then retry.", roman: "Wallet mein Arc Mainnet par thori USDC daliye, phir dobara try kijiye." }],
  });
  if (!w.registered && w.streams.length === 0) out.push({
    sev: "info",
    cause: { en: "This wallet has no agent profile and no streams on PulseRank yet.", roman: "Is wallet ka PulseRank par abhi koi agent profile ya stream nahi hai." },
    fix: [
      { en: "To earn: register in the Agent tab. To fund an agent: use the Funder tab.", roman: "Kamane ke liye: Agent tab mein register kijiye. Agent ko fund karne ke liye: Funder tab use kijiye." },
    ],
    action: { label: "Open Agent tab", tab: "agent" },
  });
  if (w.registered && w.score && w.score.value === 0 && !w.streams.some(s => s.asAgent && s.status > 0 && s.status !== 5)) out.push({
    sev: "info",
    cause: { en: "Score is 0 because no stream has been accepted yet. The score is created (at 400) the first time you accept a stream.", roman: "Score 0 hai kyunke abhi koi stream accept nahi hui. Pehli stream accept karne par score (400 se) ban jata hai." },
  });
  return out;
}

export interface Diagnosis { text: string; actions: ChatAction[]; worst: Sev }

export function buildDiagnosis(w: WalletFacts, lang: Lang, isOwn: boolean): Diagnosis {
  const findings: Finding[] = [...w.streams.flatMap(s => streamFindings(s, w)), ...walletFindings(w)]
    .sort((a, b) => ORDER[a.sev] - ORDER[b.sev]);

  const who = `${w.address.slice(0, 6)}…${w.address.slice(-4)}`;
  const agentCount = w.streams.filter(s => s.asAgent).length;
  const funderCount = w.streams.filter(s => s.asFunder).length;
  const profile = w.profiles[0];
  const head = pick(lang, {
    en: `**Scan of ${isOwn ? "your wallet " : ""}${who}** (Arc Mainnet, block ${w.headBlock.toString()})\n- Agent profile: ${profile ? `${profile.name}${w.score ? `, score ${w.score.value}/1000 (${w.score.tier})` : ""}` : "none"}\n- Streams: ${agentCount} as agent, ${funderCount} as funder\n- Pending payout: ${usd(w.pending)}`,
    roman: `**${isOwn ? "Aapke wallet " : ""}${who} ka scan** (Arc Mainnet, block ${w.headBlock.toString()})\n- Agent profile: ${profile ? `${profile.name}${w.score ? `, score ${w.score.value}/1000 (${w.score.tier})` : ""}` : "koi nahi"}\n- Streams: ${agentCount} agent ke taur par, ${funderCount} funder ke taur par\n- Pending payout: ${usd(w.pending)}`,
  });

  const actions: ChatAction[] = [];
  const seen = new Set<string>();
  const lines: string[] = [];
  const problems = findings.filter(f => f.sev === "critical" || f.sev === "warn");

  if (problems.length === 0) {
    lines.push(pick(lang, {
      en: "**Root cause: nothing is wrong.** I found no timed-out, unaccepted or unclaimed stream on this wallet.",
      roman: "**Asal wajah: koi masla nahi.** Is wallet par mujhe koi timed-out, unaccepted ya unclaimed stream nahi mili.",
    }));
  } else {
    lines.push(pick(lang, { en: "**Root cause**", roman: "**Asal wajah**" }));
  }
  for (const f of findings) {
    lines.push(`- [${ICON[f.sev]}] ${pick(lang, f.cause)}`);
  }
  const steps = problems.flatMap(f => f.fix ?? []);
  if (steps.length) {
    lines.push("", pick(lang, { en: "**How to fix it**", roman: "**Hal kaise karein**" }));
    steps.forEach((st, n) => lines.push(`${n + 1}. ${pick(lang, st)}`));
  }
  for (const f of findings) {
    if (f.action && (f.sev === "critical" || f.sev === "warn") && !seen.has(f.action.tab)) {
      seen.add(f.action.tab);
      actions.push(f.action);
    }
  }
  return { text: `${head}\n\n${lines.join("\n")}`, actions, worst: findings[0]?.sev ?? "ok" };
}
