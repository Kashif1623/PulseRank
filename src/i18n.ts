/**
 * PulseRank i18n — English, Roman Urdu, Hindi (Devanagari), Bengali
 * Usage: const { t, lang, setLang } = useLang()
 */
import { createContext, useContext } from 'react'

export type Lang = 'en' | 'ur' | 'hi' | 'bn'

export const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
  ur: 'اردو',
  hi: 'हिन्दी',
  bn: 'বাংলা',
}

export const LANG_FLAGS: Record<Lang, string> = {
  en: '🇺🇸',
  ur: '🇵🇰',
  hi: '🇮🇳',
  bn: '🇧🇩',
}

type Translations = {
  // Nav
  nav_leaderboard: string
  nav_funder: string
  nav_agent: string
  arc_mainnet: string
  wrong_network: string
  connect_wallet: string

  // Common
  usdc: string
  score: string
  rank: string
  streams: string
  loading: string
  refresh: string
  close: string
  cancel: string
  confirm_wallet: string
  confirming: string
  switch_to_arc: string
  copy_address: string
  copied: string

  // Not deployed
  not_deployed_title: string
  not_deployed_body: string

  // Leaderboard
  leaderboard_title: string
  leaderboard_subtitle: string
  registered_agents: string
  badge_diamond: string
  badge_gold: string
  badge_at_risk: string
  badge_legend_diamond: string
  badge_legend_gold: string
  badge_legend_at_risk: string
  no_agents_title: string
  no_agents_body: string

  // Funder
  funder_title: string
  funder_subtitle: string
  new_stream: string
  propose_stream: string
  agent_address: string
  agent_address_placeholder: string
  amount_usdc: string
  balance: string
  duration_days: string
  heartbeat_mode: string
  mode_strict: string
  mode_normal: string
  mode_relaxed: string
  mode_interval: string
  mode_grace: string
  approve_usdc: string
  cancel_proposal: string
  force_reclaim: string
  force_unpause: string
  pause: string
  unpause: string
  stream_id: string
  earned: string
  rate_per_day: string
  duration: string
  hb_interval: string
  no_streams_title: string
  no_streams_body: string

  // Status pills
  status_proposed: string
  status_alive: string
  status_grace: string
  status_dead: string
  status_paused: string
  status_closed: string

  // Agent
  agent_title: string
  agent_registered: string
  agent_not_registered: string
  rep_score: string
  rep_score_hint: string
  claimable: string
  claim_usdc: string
  incoming_streams: string
  accept_stream: string
  send_heartbeat: string
  heartbeat_not_due: string
  settle_stream: string
  stream_missed_hint: string
  stream_closed_hint: string
  no_streams_agent: string
  no_streams_agent_hint: string
  connect_to_view: string

  // Countdown
  countdown_next_hb: string
  countdown_grace_ends: string
  countdown_overdue: string

  // Tooltips
  tooltip_heartbeat_title: string
  tooltip_heartbeat_body: string
  tooltip_reclaim_title: string
  tooltip_reclaim_body: string
  tooltip_score_title: string
  tooltip_score_body: string
  tooltip_mode_title: string
  tooltip_mode_body: string

  // Toasts
  toast_proposed: string
  toast_accepted: string
  toast_heartbeat_sent: string
  toast_paused: string
  toast_unpaused: string
  toast_reclaimed: string
  toast_settled: string
  toast_cancelled: string
  toast_claimed: string
  toast_approved: string
  toast_wrong_chain: string
  toast_tx_error: string
  toast_view_tx: string
}

const EN: Translations = {
  nav_leaderboard: 'Leaderboard',
  nav_funder: 'Funder',
  nav_agent: 'Agent',
  arc_mainnet: 'Arc Mainnet',
  wrong_network: 'Wrong Network',
  connect_wallet: 'Connect Wallet',

  usdc: 'USDC',
  score: 'Score',
  rank: 'Rank',
  streams: 'Streams',
  loading: 'Loading…',
  refresh: 'Refresh',
  close: 'Close',
  cancel: 'Cancel',
  confirm_wallet: 'Confirm in wallet…',
  confirming: 'Confirming…',
  switch_to_arc: 'Switch to Arc Mainnet',
  copy_address: 'Copy address',
  copied: 'Copied!',

  not_deployed_title: 'Contracts not deployed',
  not_deployed_body: 'Deploy the contracts first, then run bun run contracts:export to wire the addresses.',

  leaderboard_title: 'Leaderboard',
  leaderboard_subtitle: 'Ranked by reputation score',
  registered_agents: 'registered agents',
  badge_diamond: 'Diamond',
  badge_gold: 'Gold',
  badge_at_risk: 'At-Risk',
  badge_legend_diamond: '> 900',
  badge_legend_gold: '> 750',
  badge_legend_at_risk: '< 500',
  no_agents_title: 'No agents yet',
  no_agents_body: 'Be the first to register as an agent.',

  funder_title: 'Funder Dashboard',
  funder_subtitle: 'stream',
  new_stream: 'New Stream',
  propose_stream: 'Propose Stream',
  agent_address: 'Agent address',
  agent_address_placeholder: '0x…',
  amount_usdc: 'Amount (USDC)',
  balance: 'Balance',
  duration_days: 'Duration (days)',
  heartbeat_mode: 'Heartbeat mode',
  mode_strict: 'Strict',
  mode_normal: 'Normal',
  mode_relaxed: 'Relaxed',
  mode_interval: 'interval',
  mode_grace: 'grace',
  approve_usdc: 'Approve USDC',
  cancel_proposal: 'Cancel Proposal',
  force_reclaim: 'Force Reclaim',
  force_unpause: 'Force Unpause',
  pause: 'Pause',
  unpause: 'Unpause',
  stream_id: 'Stream',
  earned: 'earned',
  rate_per_day: 'Rate/day',
  duration: 'Duration',
  hb_interval: 'HB interval',
  no_streams_title: 'No streams yet',
  no_streams_body: 'Fund an agent to get started.',

  status_proposed: 'Proposed',
  status_alive: 'Alive',
  status_grace: 'Grace',
  status_dead: 'Dead',
  status_paused: 'Paused',
  status_closed: 'Closed',

  agent_title: 'Agent Dashboard',
  agent_registered: 'Registered agent',
  agent_not_registered: 'Not registered',
  rep_score: 'Reputation Score',
  rep_score_hint: 'Out of 1000 · +1 per heartbeat (locked ≥ 1 USDC) · −150 on reclaim',
  claimable: 'Claimable',
  claim_usdc: 'Claim {amount} USDC',
  incoming_streams: 'Incoming Streams',
  accept_stream: 'Accept Stream',
  send_heartbeat: 'SEND HEARTBEAT',
  heartbeat_not_due: 'Heartbeat not due yet',
  settle_stream: 'Settle Stream',
  stream_missed_hint: 'Missed heartbeat — claimable by anyone as a reclaim',
  stream_closed_hint: 'Stream closed — check claimable balance above',
  no_streams_agent: 'No active streams',
  no_streams_agent_hint: 'Ask a funder to propose a stream to your address.',
  connect_to_view: 'Connect your wallet to continue.',

  countdown_next_hb: 'Next heartbeat',
  countdown_grace_ends: 'Grace ends',
  countdown_overdue: 'Overdue',

  tooltip_heartbeat_title: 'What is a Heartbeat?',
  tooltip_heartbeat_body: 'Agents must send a heartbeat transaction within the stream\'s interval window to prove they are alive. Each successful heartbeat earns +1 reputation point if the locked USDC balance is ≥ 1 USDC. Missing the interval + grace window allows anyone to reclaim the stream.',
  tooltip_reclaim_title: 'What is a Reclaim?',
  tooltip_reclaim_body: 'If an agent misses their heartbeat deadline (interval + grace), anyone can trigger a reclaim. The agent receives earned USDC, the caller gets a 1% keeper bounty (max 2 USDC), and the rest is refunded to the funder. The agent also loses 150 reputation points.',
  tooltip_score_title: 'Reputation Score',
  tooltip_score_body: 'Scores range from 0 to 1000. Start at 500. Earn +1 per successful heartbeat on a stream with ≥ 1 USDC locked. A forced reclaim deducts 150 points. Diamond (>900) and Gold (>750) agents are top performers; At-Risk (<500) agents need to rebuild trust.',
  tooltip_mode_title: 'Heartbeat Modes',
  tooltip_mode_body: 'Strict (30 min interval, 10 min grace) — frequent check-ins, tight SLA. Normal (2 h / 30 min) — balanced for most agents. Relaxed (12 h / 2 h) — for slower-cadence work. The mode is fixed when the stream is created.',

  toast_proposed: 'Stream proposed! Waiting for agent to accept.',
  toast_accepted: 'Stream accepted! Heartbeat clock has started.',
  toast_heartbeat_sent: 'Heartbeat sent! +1 reputation.',
  toast_paused: 'Stream paused.',
  toast_unpaused: 'Stream resumed.',
  toast_reclaimed: 'Stream reclaimed. Funds distributed.',
  toast_settled: 'Stream settled. Well done!',
  toast_cancelled: 'Proposal cancelled. Funds refunded.',
  toast_claimed: 'Payout claimed!',
  toast_approved: 'USDC approved.',
  toast_wrong_chain: 'Please switch to Arc Mainnet (chain 5042).',
  toast_tx_error: 'Transaction failed',
  toast_view_tx: 'View transaction',
}

const UR: Translations = {
  nav_leaderboard: 'لیڈربورڈ',
  nav_funder: 'فنڈر',
  nav_agent: 'ایجنٹ',
  arc_mainnet: 'آرک مین نیٹ',
  wrong_network: 'غلط نیٹ ورک',
  connect_wallet: 'والٹ جوڑیں',

  usdc: 'USDC',
  score: 'اسکور',
  rank: 'درجہ',
  streams: 'اسٹریمز',
  loading: 'لوڈ ہو رہا ہے…',
  refresh: 'تازہ کریں',
  close: 'بند کریں',
  cancel: 'منسوخ',
  confirm_wallet: 'والٹ میں تصدیق کریں…',
  confirming: 'تصدیق ہو رہی ہے…',
  switch_to_arc: 'آرک مین نیٹ پر جائیں',
  copy_address: 'پتہ کاپی کریں',
  copied: 'کاپی ہو گیا!',

  not_deployed_title: 'کنٹریکٹس تعینات نہیں ہوئے',
  not_deployed_body: 'پہلے کنٹریکٹس تعینات کریں، پھر bun run contracts:export چلائیں۔',

  leaderboard_title: 'لیڈربورڈ',
  leaderboard_subtitle: 'ساکھ اسکور کے مطابق درجہ بندی',
  registered_agents: 'رجسٹرڈ ایجنٹس',
  badge_diamond: 'ہیرا',
  badge_gold: 'سونا',
  badge_at_risk: 'خطرے میں',
  badge_legend_diamond: '> ۹۰۰',
  badge_legend_gold: '> ۷۵۰',
  badge_legend_at_risk: '< ۵۰۰',
  no_agents_title: 'ابھی کوئی ایجنٹ نہیں',
  no_agents_body: 'پہلے ایجنٹ کے طور پر رجسٹر کریں۔',

  funder_title: 'فنڈر ڈیشبورڈ',
  funder_subtitle: 'اسٹریم',
  new_stream: 'نئی اسٹریم',
  propose_stream: 'اسٹریم تجویز کریں',
  agent_address: 'ایجنٹ کا پتہ',
  agent_address_placeholder: '0x…',
  amount_usdc: 'رقم (USDC)',
  balance: 'بیلنس',
  duration_days: 'مدت (دن)',
  heartbeat_mode: 'ہارٹ بیٹ موڈ',
  mode_strict: 'سخت',
  mode_normal: 'معمول',
  mode_relaxed: 'آرام دہ',
  mode_interval: 'وقفہ',
  mode_grace: 'مہلت',
  approve_usdc: 'USDC منظور کریں',
  cancel_proposal: 'تجویز منسوخ کریں',
  force_reclaim: 'زبردستی واپس لیں',
  force_unpause: 'زبردستی جاری کریں',
  pause: 'روکیں',
  unpause: 'جاری کریں',
  stream_id: 'اسٹریم',
  earned: 'کمایا',
  rate_per_day: 'روزانہ شرح',
  duration: 'مدت',
  hb_interval: 'HB وقفہ',
  no_streams_title: 'ابھی کوئی اسٹریم نہیں',
  no_streams_body: 'شروع کرنے کے لیے کسی ایجنٹ کو فنڈ کریں۔',

  status_proposed: 'تجویز شدہ',
  status_alive: 'فعال',
  status_grace: 'مہلت',
  status_dead: 'بند',
  status_paused: 'موقوف',
  status_closed: 'ختم',

  agent_title: 'ایجنٹ ڈیشبورڈ',
  agent_registered: 'رجسٹرڈ ایجنٹ',
  agent_not_registered: 'غیر رجسٹرڈ',
  rep_score: 'ساکھ اسکور',
  rep_score_hint: '۱۰۰۰ میں سے · ہر ہارٹ بیٹ پر +۱ (مقفل ≥ ۱ USDC) · ریکلیم پر −۱۵۰',
  claimable: 'قابل دعویٰ',
  claim_usdc: '{amount} USDC دعویٰ کریں',
  incoming_streams: 'آنے والی اسٹریمز',
  accept_stream: 'اسٹریم قبول کریں',
  send_heartbeat: 'ہارٹ بیٹ بھیجیں',
  heartbeat_not_due: 'ہارٹ بیٹ ابھی نہیں',
  settle_stream: 'اسٹریم طے کریں',
  stream_missed_hint: 'ہارٹ بیٹ چھوٹ گیا — کوئی بھی ریکلیم کر سکتا ہے',
  stream_closed_hint: 'اسٹریم بند — اوپر قابل دعویٰ بیلنس دیکھیں',
  no_streams_agent: 'کوئی فعال اسٹریم نہیں',
  no_streams_agent_hint: 'کسی فنڈر سے اسٹریم تجویز کرنے کو کہیں۔',
  connect_to_view: 'جاری رکھنے کے لیے والٹ جوڑیں۔',

  countdown_next_hb: 'اگلا ہارٹ بیٹ',
  countdown_grace_ends: 'مہلت ختم',
  countdown_overdue: 'تاخیر',

  tooltip_heartbeat_title: 'ہارٹ بیٹ کیا ہے؟',
  tooltip_heartbeat_body: 'ایجنٹس کو اپنی فعالیت ثابت کرنے کے لیے وقفے کے اندر ہارٹ بیٹ ٹرانزیکشن بھیجنا ضروری ہے۔ ہر کامیاب ہارٹ بیٹ +۱ ساکھ پوائنٹ دیتا ہے اگر مقفل USDC ≥ ۱ ہو۔ مہلت گزرنے پر کوئی بھی ریکلیم کر سکتا ہے۔',
  tooltip_reclaim_title: 'ریکلیم کیا ہے؟',
  tooltip_reclaim_body: 'اگر ایجنٹ ہارٹ بیٹ سے چوک جائے تو کوئی بھی ریکلیم شروع کر سکتا ہے۔ ایجنٹ کمایا USDC پاتا ہے، کال کرنے والے کو ۱٪ انعام (زیادہ سے زیادہ ۲ USDC)، اور باقی فنڈر کو واپس۔ ایجنٹ کے ۱۵۰ پوائنٹس بھی کم ہوتے ہیں۔',
  tooltip_score_title: 'ساکھ اسکور',
  tooltip_score_body: 'اسکور ۰ سے ۱۰۰۰ تک ہے۔ شروعات ۵۰۰ سے۔ ہارٹ بیٹ پر +۱، ریکلیم پر −۱۵۰۔ ہیرا (>۹۰۰) اور سونا (>۷۵۰) بہترین ہیں؛ خطرے میں (<۵۰۰) کو بھروسہ بحال کرنا ہوگا۔',
  tooltip_mode_title: 'ہارٹ بیٹ موڈز',
  tooltip_mode_body: 'سخت (۳۰ منٹ / ۱۰ منٹ)۔ معمول (۲ گھنٹے / ۳۰ منٹ)۔ آرام دہ (۱۲ گھنٹے / ۲ گھنٹے)۔ موڈ اسٹریم بنانے پر طے ہو جاتا ہے۔',

  toast_proposed: 'اسٹریم تجویز ہو گئی! ایجنٹ کی قبولیت کا انتظار ہے۔',
  toast_accepted: 'اسٹریم قبول ہو گئی! ہارٹ بیٹ گھڑی شروع ہو گئی۔',
  toast_heartbeat_sent: 'ہارٹ بیٹ بھیجا! +۱ ساکھ۔',
  toast_paused: 'اسٹریم موقوف ہو گئی۔',
  toast_unpaused: 'اسٹریم دوبارہ شروع ہو گئی۔',
  toast_reclaimed: 'اسٹریم واپس لے لی۔ فنڈز تقسیم ہو گئے۔',
  toast_settled: 'اسٹریم طے ہو گئی۔ شاباش!',
  toast_cancelled: 'تجویز منسوخ۔ فنڈز واپس ہو گئے۔',
  toast_claimed: 'ادائیگی وصول ہو گئی!',
  toast_approved: 'USDC منظور ہو گیا۔',
  toast_wrong_chain: 'براہ کرم آرک مین نیٹ پر جائیں (چین ۵۰۴۲)۔',
  toast_tx_error: 'ٹرانزیکشن ناکام ہو گئی',
  toast_view_tx: 'ٹرانزیکشن دیکھیں',
}

const HI: Translations = {
  nav_leaderboard: 'लीडरबोर्ड',
  nav_funder: 'फ़ंडर',
  nav_agent: 'एजेंट',
  arc_mainnet: 'Arc मेननेट',
  wrong_network: 'गलत नेटवर्क',
  connect_wallet: 'वॉलेट जोड़ें',

  usdc: 'USDC',
  score: 'स्कोर',
  rank: 'रैंक',
  streams: 'स्ट्रीम्स',
  loading: 'लोड हो रहा है…',
  refresh: 'ताज़ा करें',
  close: 'बंद करें',
  cancel: 'रद्द करें',
  confirm_wallet: 'वॉलेट में पुष्टि करें…',
  confirming: 'पुष्टि हो रही है…',
  switch_to_arc: 'Arc Mainnet पर जाएं',
  copy_address: 'पता कॉपी करें',
  copied: 'कॉपी हुआ!',

  not_deployed_title: 'कॉन्ट्रैक्ट तैनात नहीं',
  not_deployed_body: 'पहले कॉन्ट्रैक्ट तैनात करें, फिर bun run contracts:export चलाएं।',

  leaderboard_title: 'लीडरबोर्ड',
  leaderboard_subtitle: 'प्रतिष्ठा स्कोर के अनुसार क्रमबद्ध',
  registered_agents: 'पंजीकृत एजेंट',
  badge_diamond: 'डायमंड',
  badge_gold: 'गोल्ड',
  badge_at_risk: 'जोखिम में',
  badge_legend_diamond: '> ९००',
  badge_legend_gold: '> ७५०',
  badge_legend_at_risk: '< ५००',
  no_agents_title: 'अभी कोई एजेंट नहीं',
  no_agents_body: 'पहला एजेंट बनने के लिए रजिस्टर करें।',

  funder_title: 'फ़ंडर डैशबोर्ड',
  funder_subtitle: 'स्ट्रीम',
  new_stream: 'नई स्ट्रीम',
  propose_stream: 'स्ट्रीम प्रस्तावित करें',
  agent_address: 'एजेंट पता',
  agent_address_placeholder: '0x…',
  amount_usdc: 'राशि (USDC)',
  balance: 'बैलेंस',
  duration_days: 'अवधि (दिन)',
  heartbeat_mode: 'हार्टबीट मोड',
  mode_strict: 'सख्त',
  mode_normal: 'सामान्य',
  mode_relaxed: 'शिथिल',
  mode_interval: 'अंतराल',
  mode_grace: 'ग्रेस',
  approve_usdc: 'USDC अनुमोदित करें',
  cancel_proposal: 'प्रस्ताव रद्द करें',
  force_reclaim: 'जबरन पुनः दावा',
  force_unpause: 'जबरन जारी करें',
  pause: 'रोकें',
  unpause: 'जारी करें',
  stream_id: 'स्ट्रीम',
  earned: 'अर्जित',
  rate_per_day: 'दैनिक दर',
  duration: 'अवधि',
  hb_interval: 'HB अंतराल',
  no_streams_title: 'अभी कोई स्ट्रीम नहीं',
  no_streams_body: 'शुरू करने के लिए किसी एजेंट को फ़ंड करें।',

  status_proposed: 'प्रस्तावित',
  status_alive: 'सक्रिय',
  status_grace: 'ग्रेस',
  status_dead: 'निष्क्रिय',
  status_paused: 'रुका हुआ',
  status_closed: 'बंद',

  agent_title: 'एजेंट डैशबोर्ड',
  agent_registered: 'पंजीकृत एजेंट',
  agent_not_registered: 'पंजीकृत नहीं',
  rep_score: 'प्रतिष्ठा स्कोर',
  rep_score_hint: '१००० में से · प्रत्येक हार्टबीट पर +१ (लॉक्ड ≥ १ USDC) · रिक्लेम पर −१५०',
  claimable: 'दावा योग्य',
  claim_usdc: '{amount} USDC दावा करें',
  incoming_streams: 'आने वाली स्ट्रीम्स',
  accept_stream: 'स्ट्रीम स्वीकार करें',
  send_heartbeat: 'हार्टबीट भेजें',
  heartbeat_not_due: 'हार्टबीट अभी नहीं',
  settle_stream: 'स्ट्रीम निपटाएं',
  stream_missed_hint: 'हार्टबीट चूक गई — कोई भी रिक्लेम कर सकता है',
  stream_closed_hint: 'स्ट्रीम बंद — ऊपर दावा योग्य बैलेंस देखें',
  no_streams_agent: 'कोई सक्रिय स्ट्रीम नहीं',
  no_streams_agent_hint: 'किसी फ़ंडर से स्ट्रीम प्रस्तावित करने को कहें।',
  connect_to_view: 'जारी रखने के लिए वॉलेट जोड़ें।',

  countdown_next_hb: 'अगला हार्टबीट',
  countdown_grace_ends: 'ग्रेस समाप्त',
  countdown_overdue: 'अतिदेय',

  tooltip_heartbeat_title: 'हार्टबीट क्या है?',
  tooltip_heartbeat_body: 'एजेंट को अपनी सक्रियता सिद्ध करने के लिए निर्धारित अंतराल में हार्टबीट ट्रांज़ैक्शन भेजना होता है। प्रत्येक सफल हार्टबीट पर +१ प्रतिष्ठा अंक मिलता है यदि लॉक्ड USDC ≥ १ हो। समय-सीमा पार होने पर कोई भी रिक्लेम कर सकता है।',
  tooltip_reclaim_title: 'रिक्लेम क्या है?',
  tooltip_reclaim_body: 'यदि एजेंट हार्टबीट समय-सीमा चूक जाए तो कोई भी रिक्लेम शुरू कर सकता है। एजेंट को अर्जित USDC मिलता है, कॉलर को १% बाउंटी (अधिकतम २ USDC), और शेष फ़ंडर को वापस। एजेंट के १५० प्रतिष्ठा अंक कटते हैं।',
  tooltip_score_title: 'प्रतिष्ठा स्कोर',
  tooltip_score_body: 'स्कोर ० से १००० तक। शुरुआत ५०० से। हार्टबीट पर +१, रिक्लेम पर −१५०। डायमंड (>९००) और गोल्ड (>७५०) शीर्ष प्रदर्शनकर्ता; जोखिम में (<५००) को विश्वास पुनः अर्जित करना होगा।',
  tooltip_mode_title: 'हार्टबीट मोड्स',
  tooltip_mode_body: 'सख्त (३० मिनट / १० मिनट)। सामान्य (२ घंटे / ३० मिनट)। शिथिल (१२ घंटे / २ घंटे)। मोड स्ट्रीम बनाते समय तय होता है।',

  toast_proposed: 'स्ट्रीम प्रस्तावित! एजेंट की स्वीकृति का इंतज़ार।',
  toast_accepted: 'स्ट्रीम स्वीकृत! हार्टबीट घड़ी शुरू हुई।',
  toast_heartbeat_sent: 'हार्टबीट भेजी! +१ प्रतिष्ठा।',
  toast_paused: 'स्ट्रीम रुक गई।',
  toast_unpaused: 'स्ट्रीम फिर शुरू हुई।',
  toast_reclaimed: 'स्ट्रीम रिक्लेम हुई। फ़ंड वितरित।',
  toast_settled: 'स्ट्रीम निपटाई। बढ़िया!',
  toast_cancelled: 'प्रस्ताव रद्द। फ़ंड वापस।',
  toast_claimed: 'भुगतान प्राप्त!',
  toast_approved: 'USDC अनुमोदित।',
  toast_wrong_chain: 'कृपया Arc Mainnet (चेन ५०४२) पर जाएं।',
  toast_tx_error: 'ट्रांज़ैक्शन विफल',
  toast_view_tx: 'ट्रांज़ैक्शन देखें',
}

const BN: Translations = {
  nav_leaderboard: 'লিডারবোর্ড',
  nav_funder: 'ফান্ডার',
  nav_agent: 'এজেন্ট',
  arc_mainnet: 'Arc মেইননেট',
  wrong_network: 'ভুল নেটওয়ার্ক',
  connect_wallet: 'ওয়ালেট সংযুক্ত করুন',

  usdc: 'USDC',
  score: 'স্কোর',
  rank: 'র‍্যাংক',
  streams: 'স্ট্রিম',
  loading: 'লোড হচ্ছে…',
  refresh: 'রিফ্রেশ',
  close: 'বন্ধ করুন',
  cancel: 'বাতিল',
  confirm_wallet: 'ওয়ালেটে নিশ্চিত করুন…',
  confirming: 'নিশ্চিত হচ্ছে…',
  switch_to_arc: 'Arc Mainnet-এ যান',
  copy_address: 'ঠিকানা কপি করুন',
  copied: 'কপি হয়েছে!',

  not_deployed_title: 'চুক্তি স্থাপিত হয়নি',
  not_deployed_body: 'প্রথমে চুক্তিগুলি স্থাপন করুন, তারপর bun run contracts:export চালান।',

  leaderboard_title: 'লিডারবোর্ড',
  leaderboard_subtitle: 'সুনাম স্কোর অনুযায়ী র‍্যাংক',
  registered_agents: 'নিবন্ধিত এজেন্ট',
  badge_diamond: 'ডায়মন্ড',
  badge_gold: 'গোল্ড',
  badge_at_risk: 'ঝুঁকিতে',
  badge_legend_diamond: '> ৯০০',
  badge_legend_gold: '> ৭৫০',
  badge_legend_at_risk: '< ৫০০',
  no_agents_title: 'এখনও কোনো এজেন্ট নেই',
  no_agents_body: 'প্রথম এজেন্ট হিসেবে নিবন্ধন করুন।',

  funder_title: 'ফান্ডার ড্যাশবোর্ড',
  funder_subtitle: 'স্ট্রিম',
  new_stream: 'নতুন স্ট্রিম',
  propose_stream: 'স্ট্রিম প্রস্তাব করুন',
  agent_address: 'এজেন্টের ঠিকানা',
  agent_address_placeholder: '0x…',
  amount_usdc: 'পরিমাণ (USDC)',
  balance: 'ব্যালেন্স',
  duration_days: 'সময়কাল (দিন)',
  heartbeat_mode: 'হার্টবিট মোড',
  mode_strict: 'কঠোর',
  mode_normal: 'স্বাভাবিক',
  mode_relaxed: 'শিথিল',
  mode_interval: 'বিরতি',
  mode_grace: 'গ্রেস',
  approve_usdc: 'USDC অনুমোদন করুন',
  cancel_proposal: 'প্রস্তাব বাতিল',
  force_reclaim: 'জোরপূর্বক রিক্লেম',
  force_unpause: 'জোরপূর্বক চালু',
  pause: 'বিরতি',
  unpause: 'পুনরায় চালু',
  stream_id: 'স্ট্রিম',
  earned: 'অর্জিত',
  rate_per_day: 'দৈনিক হার',
  duration: 'সময়কাল',
  hb_interval: 'HB বিরতি',
  no_streams_title: 'এখনও কোনো স্ট্রিম নেই',
  no_streams_body: 'শুরু করতে একজন এজেন্টকে ফান্ড করুন।',

  status_proposed: 'প্রস্তাবিত',
  status_alive: 'সক্রিয়',
  status_grace: 'গ্রেস',
  status_dead: 'নিষ্ক্রিয়',
  status_paused: 'বিরতিতে',
  status_closed: 'বন্ধ',

  agent_title: 'এজেন্ট ড্যাশবোর্ড',
  agent_registered: 'নিবন্ধিত এজেন্ট',
  agent_not_registered: 'নিবন্ধিত নয়',
  rep_score: 'সুনাম স্কোর',
  rep_score_hint: '১০০০ এর মধ্যে · প্রতি হার্টবিটে +১ (লক্ড ≥ ১ USDC) · রিক্লেমে −১৫০',
  claimable: 'দাবিযোগ্য',
  claim_usdc: '{amount} USDC দাবি করুন',
  incoming_streams: 'আগত স্ট্রিম',
  accept_stream: 'স্ট্রিম গ্রহণ করুন',
  send_heartbeat: 'হার্টবিট পাঠান',
  heartbeat_not_due: 'হার্টবিট এখনও নয়',
  settle_stream: 'স্ট্রিম নিষ্পত্তি করুন',
  stream_missed_hint: 'হার্টবিট মিস — যে কেউ রিক্লেম করতে পারবে',
  stream_closed_hint: 'স্ট্রিম বন্ধ — উপরে দাবিযোগ্য ব্যালেন্স দেখুন',
  no_streams_agent: 'কোনো সক্রিয় স্ট্রিম নেই',
  no_streams_agent_hint: 'একজন ফান্ডারকে আপনার ঠিকানায় স্ট্রিম প্রস্তাব করতে বলুন।',
  connect_to_view: 'চালিয়ে যেতে ওয়ালেট সংযুক্ত করুন।',

  countdown_next_hb: 'পরবর্তী হার্টবিট',
  countdown_grace_ends: 'গ্রেস শেষ',
  countdown_overdue: 'অতিদেয়',

  tooltip_heartbeat_title: 'হার্টবিট কী?',
  tooltip_heartbeat_body: 'এজেন্টদের নির্ধারিত বিরতির মধ্যে হার্টবিট লেনদেন পাঠাতে হয়। প্রতিটি সফল হার্টবিটে +১ সুনাম পয়েন্ট পাওয়া যায় যদি লক্ড USDC ≥ ১ হয়। সময়সীমা পার হলে যে কেউ রিক্লেম করতে পারবে।',
  tooltip_reclaim_title: 'রিক্লেম কী?',
  tooltip_reclaim_body: 'এজেন্ট হার্টবিট সময়সীমা মিস করলে যে কেউ রিক্লেম শুরু করতে পারে। এজেন্ট অর্জিত USDC পায়, কলার ১% বাউন্টি (সর্বোচ্চ ২ USDC), বাকি ফান্ডারকে ফেরত। এজেন্টের ১৫০ পয়েন্ট কাটা যায়।',
  tooltip_score_title: 'সুনাম স্কোর',
  tooltip_score_body: 'স্কোর ০ থেকে ১০০০। শুরু ৫০০ থেকে। হার্টবিটে +১, রিক্লেমে −১৫০। ডায়মন্ড (>৯০০) ও গোল্ড (>৭৫০) শীর্ষ; ঝুঁকিতে (<৫০০) আস্থা পুনর্গঠন করতে হবে।',
  tooltip_mode_title: 'হার্টবিট মোড',
  tooltip_mode_body: 'কঠোর (৩০ মিনিট / ১০ মিনিট)। স্বাভাবিক (২ ঘন্টা / ৩০ মিনিট)। শিথিল (১২ ঘন্টা / ২ ঘন্টা)। স্ট্রিম তৈরির সময় মোড নির্ধারিত হয়।',

  toast_proposed: 'স্ট্রিম প্রস্তাবিত! এজেন্টের গ্রহণের অপেক্ষা।',
  toast_accepted: 'স্ট্রিম গৃহীত! হার্টবিট ঘড়ি শুরু হয়েছে।',
  toast_heartbeat_sent: 'হার্টবিট পাঠানো হয়েছে! +১ সুনাম।',
  toast_paused: 'স্ট্রিম বিরতিতে।',
  toast_unpaused: 'স্ট্রিম পুনরায় চালু।',
  toast_reclaimed: 'স্ট্রিম রিক্লেম হয়েছে। ফান্ড বিতরণ হয়েছে।',
  toast_settled: 'স্ট্রিম নিষ্পত্তি হয়েছে। চমৎকার!',
  toast_cancelled: 'প্রস্তাব বাতিল। ফান্ড ফেরত।',
  toast_claimed: 'পেমেন্ট দাবি করা হয়েছে!',
  toast_approved: 'USDC অনুমোদিত।',
  toast_wrong_chain: 'অনুগ্রহ করে Arc Mainnet (চেইন ৫০৪২)-এ যান।',
  toast_tx_error: 'লেনদেন ব্যর্থ হয়েছে',
  toast_view_tx: 'লেনদেন দেখুন',
}

export const TRANSLATIONS: Record<Lang, Translations> = { en: EN, ur: UR, hi: HI, bn: BN }

export interface LangContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: Translations
}

export const LangContext = createContext<LangContextValue>({
  lang: 'en',
  setLang: () => undefined,
  t: EN,
})

export function useLang() {
  return useContext(LangContext)
}
