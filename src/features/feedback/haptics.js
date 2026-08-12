export const HAPTIC_PATTERNS = Object.freeze({
  /* Very short pulses are accepted by the browser but disappear beneath the
     spin-up time of common Android motors. This is a crisp double impact with
     enough active time to be felt on physical Samsung hardware. */
  complete: Object.freeze([24, 32, 36]),
});

export function triggerDeviceHaptic(pattern, device = globalThis.navigator) {
  try {
    if (!device || typeof device.vibrate !== "function") return false;
    const request = Array.isArray(pattern) ? [...pattern] : pattern;
    return Boolean(device.vibrate(request));
  } catch {
    return false;
  }
}
