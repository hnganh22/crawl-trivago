const THRESHOLD = 3;

let consecutiveForbidden = 0;

export function recordSuccess() {
  consecutiveForbidden = 0;
}

export function recordForbidden() {
  consecutiveForbidden += 1;
}

export function getCount() {
  return consecutiveForbidden;
}

export function shouldTrip() {
  return consecutiveForbidden >= THRESHOLD;
}

export function reset() {
  consecutiveForbidden = 0;
}

export const BREAKER_MESSAGE =
  `Circuit breaker tripped: ${THRESHOLD} consecutive 403s — Akamai likely blocking session. Aborting.`;

export const BREAKER_THRESHOLD = THRESHOLD;