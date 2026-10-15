/**
 * Numeric helpers for the serialisation boundary.
 *
 * Every one of these adds zero before returning. `Math.round(-0.4)` is `-0`, and
 * `JSON.stringify(-0)` is `"0"` — so a negative zero that reaches the wire comes
 * back as positive zero and the two ends of a WebSocket hold values that differ
 * structurally while comparing equal with `===`. Adding zero collapses -0 to +0.
 * Rounding here also keeps eighteen-significant-digit floats out of a payload a
 * Python or Postgres backend may one day have to produce.
 */

/** Round to a whole number, normalising -0. */
export const r0 = (n: number): number => Math.round(n) + 0

/** Round to two decimal places, normalising -0. */
export const r2 = (n: number): number => Math.round(n * 100) / 100 + 0

/** Round to three decimal places (millimetre precision), normalising -0. */
export const r3 = (n: number): number => Math.round(n * 1000) / 1000 + 0

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
