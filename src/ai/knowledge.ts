import contractsJson from "../contracts.json";
import { tokens, type Lang, pick } from "./language";

// Protocol facts below are taken from the deployed contract source (contracts/*.sol), not guessed.

const C = contractsJson.contracts;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

interface L { en: string; roman: string; ur?: string }
export interface Topic {
  id: string;
  /** Matches against the lower-cased question. Each hit adds `weight`. */
  patterns: RegExp[];
  weight?: number;
  answer: () => L;
  /** Topics worth suggesting next. */
  related?: string[];
}

export const TOPICS: Topic[] = [
  {
    id: "greeting",
    patterns: [/\b(hi|hello|hey|salam|assalam|aoa|slam)\b/, /السلام|ہیلو/],
    weight: 1,
    answer: () => ({
      en: "Hello! I'm the PulseRank protocol assistant. Ask me how streams, heartbeats, scores or escrow settlement work, or say \"scan my wallet\" and I'll check your agent or stream live on Arc Mainnet.",
      roman: "Assalam o Alaikum! Main PulseRank ka protocol assistant hoon. Streams, heartbeats, score ya escrow settlement ke bare mein poochiye, ya \"scan my wallet\" likhiye aur main Arc Mainnet par aapka agent ya stream live check kar deta hoon.",
      ur: "السلام علیکم! میں PulseRank کا پروٹوکول اسسٹنٹ ہوں۔ stream، heartbeat، score یا escrow کے بارے میں پوچھیں، یا \"scan my wallet\" لکھیں تو میں Arc Mainnet پر لائیو چیک کر دوں گا۔",
    }),
  },
  {
    id: "help",
    patterns: [/\b(help|what can you|kya kar sakte|madad|features?)\b/, /مدد/],
    weight: 2,
    answer: () => ({
      en: "I can do two things.\n- **Explain**: PulseRank contracts, heartbeats, reputation score math, escrow and settlement, Arc network, gas, wallets and general Web3.\n- **Diagnose**: say \"scan my wallet\", \"why is my agent at risk?\" or paste a 0x address. I read Arc Mainnet live and tell you the exact cause and the fix.",
      roman: "Main do kaam kar sakta hoon.\n- **Samjhana**: PulseRank contracts, heartbeats, reputation score ka hisab, escrow aur settlement, Arc network, gas, wallets aur Web3 basics.\n- **Diagnose karna**: \"scan my wallet\", \"kya masla aya hai?\" ya koi 0x address likhiye. Main Arc Mainnet live padh kar sahi wajah aur hal bata deta hoon.",
    }),
  },
  {
    id: "overview",
    patterns: [/pulse ?rank/, /\b(protocol|project|app|dapp)\b.*\b(what|kya|about)\b/, /what is (this|it)\b/, /yeh kya hai|ye kya hai/],
    weight: 2,
    answer: () => ({
      en: "PulseRank is an escrow-and-reputation protocol for AI agents on Arc Mainnet. A funder locks USDC in a stream for an agent. The agent accepts, then proves it is alive by sending heartbeats while the USDC accrues second by second. If the agent goes silent past its grace window, anyone can reclaim the unearned USDC and the agent's score drops. When a stream ends, it is settled and the agent withdraws what it earned.\n\nFour contracts do the work: Registry (identities), Score (reputation 0-1000), Task (milestone caps) and Stream (escrow, heartbeats, settlement).",
      roman: "PulseRank Arc Mainnet par AI agents ke liye escrow aur reputation protocol hai. Funder agent ke liye stream mein USDC lock karta hai. Agent accept karta hai, phir heartbeats bhej kar sabit karta hai ke woh zinda hai, aur USDC har second accrue hoti rehti hai. Agar agent grace window ke baad bhi khamosh rahe to koi bhi unearned USDC reclaim kar sakta hai aur agent ka score gir jata hai. Stream khatam ho to settle hoti hai aur agent apni earned raqam withdraw karta hai.\n\nChaar contracts kaam karte hain: Registry (identity), Score (reputation 0-1000), Task (milestone cap) aur Stream (escrow, heartbeats, settlement).",
    }),
    related: ["stream", "heartbeat", "score"],
  },
  {
    id: "contracts",
    patterns: [/contracts?\b.*\b(address|list|deployed)/, /address(es)?\b.*\bcontracts?/, /\b(registry|task)\b/, /pulse(registry|score|task|stream)v2/],
    weight: 2,
    answer: () => ({
      en: `Deployed on Arc Mainnet (chain 5042):\n- **PulseRegistryV2** ${short(C.PulseRegistryV2.address)}: agent identities. registerAgent(name, profileURI, minDailyRate); names are unique, one wallet can own several profiles.\n- **PulseScoreV2** ${short(C.PulseScoreV2.address)}: reputation, only the Stream contract can change it.\n- **PulseTaskV2** ${short(C.PulseTaskV2.address)}: optional milestones. A stream linked to a task can only pay out the share of milestones approved so far.\n- **PulseStreamV2** ${short(C.PulseStreamV2.address)}: escrow, heartbeats, timeout reclaim, settlement and payouts.`,
      roman: `Arc Mainnet (chain 5042) par deployed:\n- **PulseRegistryV2** ${short(C.PulseRegistryV2.address)}: agent identity. registerAgent(name, profileURI, minDailyRate); naam unique hote hain, ek wallet kai profiles rakh sakta hai.\n- **PulseScoreV2** ${short(C.PulseScoreV2.address)}: reputation, ise sirf Stream contract badal sakta hai.\n- **PulseTaskV2** ${short(C.PulseTaskV2.address)}: optional milestones. Task se juri stream sirf approved milestones ke hissay tak payout kar sakti hai.\n- **PulseStreamV2** ${short(C.PulseStreamV2.address)}: escrow, heartbeats, timeout reclaim, settlement aur payouts.`,
    }),
  },
  {
    id: "score",
    patterns: [/\b(score|reputation|tier|bronze|silver|gold|elite|rank|ranking)\b/, /سکور|ریپوٹیشن/],
    weight: 2,
    answer: () => ({
      en: "Reputation lives in PulseScoreV2 and runs 0 to 1000.\n- **Start**: an agent gets 400 the first time it accepts a stream (Silver).\n- **Heartbeat**: +1, but only if at least 1 USDC of the stream is still unearned at that moment. Small streams (under 1 USDC) never raise the score.\n- **Hard reclaim** (timed-out stream): -100, floor 0.\n- **Tiers**: Bronze below 300, Silver 300-599, Gold 600-799, Elite 800+.\n- The score contract also has +25 for a success, +10 for a won dispute and -20 for a lost one, but the current Stream contract only calls the heartbeat and reclaim hooks, so settling a stream does not change the score today.",
      roman: "Reputation PulseScoreV2 mein hai aur 0 se 1000 tak chalti hai.\n- **Shuruat**: agent jab pehli baar stream accept karta hai to 400 milta hai (Silver).\n- **Heartbeat**: +1, lekin sirf tab jab us waqt stream ki kam az kam 1 USDC unearned ho. Chhoti streams (1 USDC se kam) score nahi barhatin.\n- **Hard reclaim** (timeout stream): -100, minimum 0.\n- **Tiers**: Bronze 300 se kam, Silver 300-599, Gold 600-799, Elite 800+.\n- Score contract mein success par +25, dispute jeetne par +10 aur haarne par -20 bhi hai, lekin maujooda Stream contract sirf heartbeat aur reclaim hooks call karta hai, is liye settle karne se score abhi nahi badalta.",
      ur: "ریپوٹیشن PulseScoreV2 میں ہے اور 0 سے 1000 تک چلتی ہے۔ پہلی stream accept کرنے پر 400 ملتے ہیں (Silver)۔ heartbeat پر +1، مگر صرف تب جب stream کا کم از کم 1 USDC ابھی earn نہ ہوا ہو۔ timeout reclaim پر -100۔ Tiers: Bronze 300 سے کم، Silver 300-599، Gold 600-799، Elite 800+۔",
    }),
    related: ["heartbeat", "timeout"],
  },
  {
    id: "heartbeat",
    patterns: [/heart ?beats?/, /\b(strict|normal|relaxed)\b/, /\b(interval|grace|alive|liveness|zinda)\b/, /ہارٹ/],
    weight: 3,
    answer: () => ({
      en: "A heartbeat is a transaction the agent sends (sendHeartbeat) to prove it is alive. It updates earned USDC and the last-heartbeat time.\n- **Strict**: heartbeat every 5 min, then 10 min grace (dead after 15 min of silence).\n- **Normal**: every 30 min, 30 min grace (dead after 1 h).\n- **Relaxed**: every 1 h, 2 h grace (dead after 3 h).\nRules: only the agent can send it, only while the stream is Active, and only once the interval has passed since the last one (otherwise HeartbeatTooEarly). A stream shorter than its interval can never record a heartbeat, which is fine: it simply runs to its end.",
      roman: "Heartbeat woh transaction hai jo agent (sendHeartbeat) bhejta hai taake sabit ho ke woh zinda hai. Isse earned USDC aur last-heartbeat ka waqt update hota hai.\n- **Strict**: har 5 min mein heartbeat, phir 10 min grace (15 min khamoshi ke baad dead).\n- **Normal**: har 30 min, 30 min grace (1 ghante ke baad dead).\n- **Relaxed**: har 1 ghanta, 2 ghante grace (3 ghante ke baad dead).\nQawaid: sirf agent bhej sakta hai, sirf Active stream mein, aur pichli heartbeat ke baad interval guzarne par hi (warna HeartbeatTooEarly). Jo stream apne interval se chhoti ho us mein heartbeat kabhi record nahi ho sakti, aur yeh theek hai: woh seedha apne end tak chalti hai.",
      ur: "Heartbeat وہ ٹرانزیکشن ہے جو agent بھیجتا ہے تاکہ ثابت ہو کہ وہ زندہ ہے۔ Strict: ہر 5 منٹ + 10 منٹ grace۔ Normal: ہر 30 منٹ + 30 منٹ grace۔ Relaxed: ہر 1 گھنٹہ + 2 گھنٹے grace۔",
    }),
    related: ["timeout", "stream"],
  },
  {
    id: "stream",
    patterns: [/\bstreams?\b/, /\b(propose|accept|lifecycle|accrue|accrual|pause)\b/, /اسٹریم/],
    weight: 2,
    answer: () => ({
      en: "A stream moves through these states: **Proposed** (funder locked USDC) -> **Active** (agent accepted, clock starts) -> **Completed** (settled) or **Reclaimed** (stopped early). Proposed streams can be cancelled by the funder. If the funder and the agent are the same wallet (a self-stream), the stream starts Active immediately because nobody else could accept it.\n- Creating one needs an agent registered in the Registry, at least 0.20 USDC and a duration.\n- USDC accrues per second: rate = amount / duration. Paused time does not accrue.\n- Funds stay in the Stream contract until settlement; payouts are pull-based (you withdraw with claimPayout).",
      roman: "Stream in states se guzarti hai: **Proposed** (funder ne USDC lock ki) -> **Active** (agent ne accept kiya, clock shuru) -> **Completed** (settle) ya **Reclaimed** (jaldi roki gayi). Proposed stream funder cancel kar sakta hai. Agar funder aur agent ek hi wallet hon (self-stream) to stream foran Active ho jati hai, kyunke accept karne wala koi doosra nahi hota.\n- Banane ke liye Registry mein registered agent, kam az kam 0.20 USDC aur duration chahiye.\n- USDC har second accrue hoti hai: rate = amount / duration. Pause ka waqt accrue nahi hota.\n- Funds settlement tak Stream contract mein rehte hain; payout pull-based hai (claimPayout se withdraw karte hain).",
    }),
    related: ["settle", "heartbeat"],
  },
  {
    id: "timeout",
    patterns: [/reclaim|timed ?out|time ?out|dead|expire[sd]?|missed|at risk|cancel(ed)?\b|penalty|slash/, /ٹائم آؤٹ/],
    weight: 3,
    answer: () => ({
      en: "If an Active stream goes past lastHeartbeat + interval + grace with no heartbeat, it is **timed out**. Then anyone (a keeper, the funder, even you) can call cancelTimedOutStream:\n- the agent keeps what it already earned,\n- 5% of the unearned part is a penalty (sent to the treasury, or back to the funder if no treasury is set),\n- the rest is refunded to the funder,\n- the agent's score drops by 100 and the stream becomes Reclaimed.\nFunder or agent can also end a stream early with triggerReclaim: earned goes to the agent and the rest to the funder, without the penalty.",
      roman: "Agar Active stream lastHeartbeat + interval + grace se aage nikal jaye aur heartbeat na aaye to woh **timed out** hai. Phir koi bhi (keeper, funder, aap khud) cancelTimedOutStream call kar sakta hai:\n- agent ko jo pehle earn ho chuka woh milta hai,\n- unearned hissay ka 5% penalty hai (treasury ko, ya treasury set na ho to wapas funder ko),\n- baqi funder ko refund,\n- agent ka score 100 kam aur stream Reclaimed ho jati hai.\nFunder ya agent triggerReclaim se stream jaldi bhi khatam kar sakte hain: earned agent ko, baqi funder ko, bina penalty.",
    }),
    related: ["heartbeat", "settle"],
  },
  {
    id: "settle",
    patterns: [/settle|settlement|claim|payout|withdraw|escrow|pending|paisa|raqam|nikal/, /کلیم/],
    weight: 3,
    answer: () => ({
      en: "Escrow settlement is two steps because payouts are pull-based:\n1. **Settle** (settleStream, funder or agent): once the stream has run its full duration, it becomes Completed and the contract credits `pendingPayouts` - the earned share to the agent, the unearned share to the funder.\n2. **Claim payout** (claimPayout): each wallet withdraws its own pending balance in USDC.\nSo if your stream ended but no money arrived, either nobody settled it yet, or you settled but have not claimed.",
      roman: "Escrow settlement do steps mein hoti hai kyunke payout pull-based hai:\n1. **Settle** (settleStream, funder ya agent): stream apni poori duration chala le to Completed ho jati hai aur contract `pendingPayouts` mein credit karta hai - earned hissa agent ko, unearned hissa funder ko.\n2. **Claim payout** (claimPayout): har wallet apna pending balance USDC mein withdraw karta hai.\nIs liye agar stream khatam ho gayi lekin paisa nahi aya, to ya to abhi kisi ne settle nahi ki, ya settle ho gayi par claim nahi hui.",
    }),
    related: ["stream", "timeout"],
  },
  {
    id: "task",
    patterns: [/\btasks?\b/, /milestone|deliverable|attester|approvedbps/],
    weight: 3,
    answer: () => ({
      en: "PulseTaskV2 adds optional milestones to a stream. Each milestone carries a payment share in basis points and is approved by the funder, by an attester signature (EIP-712) or automatically. When a stream is linked to a task, every settlement path caps the agent's payout at the approved share of the total (approvedBps). Unapproved milestones stay with the funder. Streams with taskId 0 have no cap.",
      roman: "PulseTaskV2 stream mein optional milestones jorta hai. Har milestone ka payment hissa basis points mein hota hai aur use funder, attester ki signature (EIP-712) ya khud-ba-khud approve karta hai. Jab stream task se juri ho to har settlement path agent ka payout total ke approved hissay (approvedBps) tak cap kar deta hai. Unapproved milestones funder ke paas rehte hain. taskId 0 wali streams par koi cap nahi.",
    }),
  },
  {
    id: "registry",
    patterns: [/register|registration|profile|identity|naam|name/, /رجسٹر/],
    weight: 1,
    answer: () => ({
      en: "Register in the Agent tab with a name (max 32 characters, unique), a profile URL and a minimum daily rate. The Registry stores it under your wallet; one wallet can hold several profiles. A funder can only open a stream to a registered agent. Your score starts only when you accept your first stream.",
      roman: "Agent tab mein naam (zyada se zyada 32 characters, unique), profile URL aur minimum daily rate ke saath register kijiye. Registry use aapke wallet ke neeche save karti hai; ek wallet kai profiles rakh sakta hai. Funder sirf registered agent ko stream bhej sakta hai. Aapka score pehli stream accept karne par shuru hota hai.",
    }),
  },
  {
    id: "funder_howto",
    patterns: [/how (do|to|can) (i )?(fund|create|open|start|propose)|funder|create (a )?stream|fund (an? )?agent|stream (kaise|kese) (banau|banao|bana)/],
    weight: 3,
    answer: () => ({
      en: "To fund an agent: open the **Funder** tab, paste the agent's address, enter at least 0.20 USDC, pick a duration (minutes, hours or days) and a heartbeat mode, then Propose Stream. Your wallet signs an USDC approval and then the proposal. The agent must press Accept Stream from its own wallet; until then your USDC just sits in escrow and you can cancel.",
      roman: "Agent ko fund karne ke liye **Funder** tab kholiye, agent ka address paste kijiye, kam az kam 0.20 USDC likhiye, duration (minutes, hours ya days) aur heartbeat mode chuniye, phir Propose Stream dabaiye. Wallet pehle USDC approval aur phir proposal sign karta hai. Agent ko apne wallet se Accept Stream dabana hoga; tab tak aapki USDC escrow mein rehti hai aur aap cancel kar sakte hain.",
    }),
    related: ["stream", "heartbeat"],
  },
  {
    id: "agent_howto",
    patterns: [/how (do|to|can) (i )?(earn|work|get paid|accept)|agent (kaise|kese)|accept stream|get paid|earn usdc/],
    weight: 3,
    answer: () => ({
      en: "As an agent: 1) register in the Agent tab, 2) wait for a funder to propose a stream to your address, 3) press Accept Stream, which starts the clock and gives you the starting score of 400, 4) send a heartbeat each interval so you are never timed out, 5) when the duration ends, settle and then claim your payout.",
      roman: "Agent ke taur par: 1) Agent tab mein register kijiye, 2) funder ke aapke address par stream propose karne ka intezar kijiye, 3) Accept Stream dabaiye, jis se clock shuru hoti hai aur 400 ka starting score milta hai, 4) har interval par heartbeat bhejiye taake timeout na ho, 5) duration khatam ho to settle karke payout claim kijiye.",
    }),
    related: ["heartbeat", "settle"],
  },
  {
    id: "duration",
    patterns: [/duration|minimum|min amount|how (long|much)|kitni der|kam az kam/],
    weight: 1,
    answer: () => ({
      en: "Minimum stream amount is 0.20 USDC (200,000 units, 6 decimals). Duration is flexible in the UI (minutes, hours or days), and the contract only rejects a duration of 0 seconds. Heartbeat modes are independent of duration, but a stream shorter than its heartbeat interval cannot record any heartbeat.",
      roman: "Stream ki minimum raqam 0.20 USDC hai (200,000 units, 6 decimals). UI mein duration flexible hai (minutes, hours ya days), aur contract sirf 0 seconds ki duration reject karta hai. Heartbeat modes duration se alag hain, lekin jo stream apne heartbeat interval se chhoti ho us mein koi heartbeat record nahi ho sakti.",
    }),
  },
  {
    id: "arc",
    patterns: [/\barc\b/, /chain ?id|5042|rpc|finality|network/],
    weight: 2,
    answer: () => ({
      en: "Arc is Circle's EVM-compatible Layer 1 where USDC is the native gas token, with sub-second finality and fees that stay predictable because they are priced in a dollar stablecoin. PulseRank runs on Arc Mainnet, chain ID 5042, RPC https://rpc.mainnet.arc.io. You do not need any other coin for gas, just USDC in your wallet.",
      roman: "Arc Circle ka EVM-compatible Layer 1 hai jahan USDC native gas token hai, sub-second finality ke saath aur fees predictable rehti hain kyunke woh dollar stablecoin mein hain. PulseRank Arc Mainnet par chalta hai, chain ID 5042, RPC https://rpc.mainnet.arc.io. Gas ke liye koi aur coin nahi chahiye, bas wallet mein USDC.",
    }),
  },
  {
    id: "gas",
    patterns: [/\b(gas|fees?|usdc|stablecoin|decimals?)\b/],
    weight: 2,
    answer: () => ({
      en: "On Arc, USDC is both the money you stream and the gas you pay with. Gas is usually a fraction of a cent. One thing to watch: the token contract uses 6 decimals (1 USDC = 1,000,000 units) while the native gas balance uses 18, so never add the two views together - it is one pool of money shown two ways.",
      roman: "Arc par USDC wohi paisa hai jo aap stream karte hain aur wohi gas bhi. Gas aam taur par ek cent ka chhota hissa hoti hai. Dhyan rakhiye: token contract 6 decimals use karta hai (1 USDC = 1,000,000 units) jabke native gas balance 18, is liye dono ko jama mat kijiye - yeh ek hi raqam hai jo do tarah dikhai jati hai.",
    }),
  },
  {
    id: "web3",
    patterns: [/web ?3|blockchain|wallet|metamask|smart contract|solidity|evm|transaction|dapp|defi|nft|token|private key|seed/],
    weight: 1,
    answer: () => ({
      en: "Quick Web3 map: a **wallet** holds your keys and signs; a **transaction** changes onchain state and costs gas; a **smart contract** is code on the chain that enforces rules without a middleman; a **dApp** is a web app that talks to those contracts. Never share your seed phrase or private key - PulseRank only ever asks your wallet to sign, never for the key. Ask me about any piece and I'll tie it back to how PulseRank uses it.",
      roman: "Web3 ka mukhtasar naqsha: **wallet** aapki keys rakhta hai aur sign karta hai; **transaction** onchain state badalti hai aur gas lagti hai; **smart contract** chain par code hai jo bina beech ke aadmi ke qawaid lagu karta hai; **dApp** woh web app hai jo in contracts se baat karti hai. Seed phrase ya private key kisi se share mat kijiye - PulseRank sirf wallet se sign karwata hai, key kabhi nahi mangta. Kisi bhi hisse ke bare mein poochiye, main PulseRank se jod kar samjhaunga.",
    }),
  },
  {
    id: "thanks",
    patterns: [/\b(thanks?|thank you|shukriya|jazak\w*|shukria)\b/, /شکریہ/],
    weight: 1,
    answer: () => ({
      en: "You're welcome! Say \"scan my wallet\" any time if you want me to check a stream live.",
      roman: "Khushi hui! Jab bhi chahein \"scan my wallet\" likhiye, main stream live check kar dunga.",
    }),
  },
];

export interface TopicMatch { topic: Topic; score: number }

/** Scores every topic against the question; best first. Empty when nothing matches. */
export function matchTopics(question: string): TopicMatch[] {
  const q = question.toLowerCase();
  const toks = new Set(tokens(question));
  const out: TopicMatch[] = [];
  for (const topic of TOPICS) {
    let score = 0;
    for (const p of topic.patterns) if (p.test(q)) score += topic.weight ?? 1;
    // A bare greeting should not beat a real question that merely contains "hi".
    if (topic.id === "greeting" && toks.size > 4) score = 0;
    if (score > 0) out.push({ topic, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

export function topicText(topic: Topic, lang: Lang): string {
  return pick(lang, topic.answer());
}

export function fallbackText(lang: Lang): string {
  return pick(lang, {
    en: "I did not catch a specific topic in that. I can explain streams, heartbeats, reputation score, timeouts and reclaim, escrow settlement or Arc and gas, and I can scan a wallet live. Try \"how does the score work?\" or \"scan my wallet\".",
    roman: "Is mein mujhe koi khaas topic samajh nahi aya. Main streams, heartbeats, reputation score, timeout aur reclaim, escrow settlement ya Arc aur gas samjha sakta hoon, aur wallet live scan bhi kar sakta hoon. \"score kaise kaam karta hai?\" ya \"scan my wallet\" likh kar dekhiye.",
    ur: "مجھے اس میں کوئی خاص موضوع سمجھ نہیں آیا۔ میں stream، heartbeat، score، reclaim اور settlement سمجھا سکتا ہوں اور wallet لائیو scan بھی کر سکتا ہوں۔",
  });
}

// ── APY / yield questions ─────────────────────────────────────────────────────
// Standing instruction from the project owner: every question about APY or yield integration gets
// this exact reply, in every language, with nothing added. No yield mechanism exists in the contracts.
export const APY_NOTICE =
  "Appreciate the interest! 🤝 Just to clarify, the APY yield feature hasn't been added to the contracts yet by Malik Kashif—it's an upcoming idea/proposal on our radar. We'll share the real technical yield strategy and router details once the APY option is officially developed and integrated! ⚡🛠️";

const YIELD_WORDS = /\b(apy|apr|yields?|yielding|interest|sood|byaj|munafa|returns?\s+on|staking\s+rewards?)\b|منافع|سود|ایپی\s?وائی/i;

export function isYieldQuestion(question: string): boolean {
  return YIELD_WORDS.test(question);
}
