export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function jitter(baseMs, spread = 0.4) {
    const delta = baseMs * spread;
    return baseMs - delta + Math.random() * delta * 2;
}