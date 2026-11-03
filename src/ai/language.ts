export type Lang = "en" | "roman" | "ur";

// Distinctive Roman Urdu words. One of these is enough to switch the reply language.
const STRONG = new Set([
  "kya", "kia", "hai", "hain", "hy", "kaise", "kese", "kaisay", "kyun", "kyu", "kab", "kahan", "kaun", "kon",
  "kitna", "kitni", "nahi", "nahin", "mera", "meri", "mere", "mujhe", "mujhy", "masla", "maslay", "karo",
  "karna", "karein", "kare", "batao", "bataiye", "samjhao", "dikhao", "bhai", "aap", "apna", "apni", "hota",
  "hoti", "hote", "chahiye", "sakta", "sakti", "sakte", "shukriya", "salam", "assalam", "theek", "acha",
  "abhi", "lekin", "magar", "agar", "wala", "wali", "kuch", "kaam",
]);
// Short words that also appear in English text: two of them are needed.
const WEAK = new Set(["ka", "ki", "ke", "ko", "mein", "par", "pe", "se", "aur", "ye", "yeh", "woh", "wo", "toh", "bhi", "ho", "kar", "ab", "sab", "ya"]);

export function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
}

export function detectLang(text: string): Lang {
  const urduChars = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  if (urduChars >= 3) return "ur";
  const toks = tokens(text);
  const strong = toks.filter(t => STRONG.has(t)).length;
  const weak = toks.filter(t => WEAK.has(t)).length;
  return strong >= 1 || weak >= 2 ? "roman" : "en";
}

/** Pick the right string for the language; Urdu script falls back to Roman Urdu when no translation exists. */
export function pick(lang: Lang, v: { en: string; roman: string; ur?: string }): string {
  if (lang === "ur") return v.ur ?? v.roman;
  return lang === "roman" ? v.roman : v.en;
}
