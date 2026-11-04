import { getAddress } from "viem";

/**
 * Reads the `--stream <address>` argument (or the fallback) and returns the EIP-55 checksummed
 * address. Input is accepted in any letter case, so a pasted lowercase or wrongly-cased address
 * never fails on its checksum. A wrong LENGTH is a different problem (a character was lost or
 * added while copying) and gets its own message, because no checksum logic can repair it.
 */
export function parseStreamArg(argv: string[], fallback: string): `0x${string}` {
  const idx = argv.indexOf("--stream");
  const raw = (idx !== -1 ? argv[idx + 1] : fallback)?.trim() ?? "";
  const hex = raw.replace(/^0x/i, "");

  if (!/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error(`--stream "${raw}" contains characters that are not hex.`);
  }
  if (hex.length !== 40) {
    throw new Error(
      `--stream "${raw}" has ${hex.length} hex characters; an address has exactly 40. ` +
        `A character was probably lost when copying. Re-copy the full address from the deploy output.`,
    );
  }
  return getAddress(`0x${hex.toLowerCase()}`);
}
