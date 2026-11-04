import { createContext, useContext } from "react";

/** Parameters carried from a finished stream into the Funder form. */
export interface StreamPrefill {
  agent:        string;
  /** Human USDC amount, e.g. "0.25". */
  amount:       string;
  durationSecs: number;
  mode:         1 | 2 | 3;
}

export type StreamAgainHandler = (p: StreamPrefill) => void;

/** Provided by App; StreamCard calls it to reopen the stream form pre-filled. */
export const StreamAgainContext = createContext<StreamAgainHandler | null>(null);

export function useStreamAgain(): StreamAgainHandler | null {
  return useContext(StreamAgainContext);
}

/** Splits a duration into the form's value + unit (whole days when exact, otherwise minutes). */
export function durationToForm(secs: number): { value: string; unit: "minutes" | "days" } {
  if (secs >= 86400 && secs % 86400 === 0) return { value: String(secs / 86400), unit: "days" };
  const mins = secs / 60;
  return { value: Number.isInteger(mins) ? String(mins) : mins.toFixed(2), unit: "minutes" };
}
