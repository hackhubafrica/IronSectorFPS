export type HapticEventKind =
  | 'fire'
  | 'fire_heavy'
  | 'hit'
  | 'kill'
  | 'damage'
  | 'explosion'
  | 'slide'
  | 'land'
  | 'reload'
  | 'ui';

interface HapticSpec {
  vibrate: number | number[];
  rumbleMs: number;
  weak: number;
  strong: number;
  minIntervalMs: number;
  priority: number;
}

const HAPTIC_SPECS: Record<HapticEventKind, HapticSpec> = {
  fire: { vibrate: 18, rumbleMs: 48, weak: 0.32, strong: 0.16, minIntervalMs: 55, priority: 2 },
  fire_heavy: { vibrate: [28, 12, 14], rumbleMs: 80, weak: 0.48, strong: 0.42, minIntervalMs: 90, priority: 3 },
  hit: { vibrate: 14, rumbleMs: 36, weak: 0.24, strong: 0.14, minIntervalMs: 45, priority: 2 },
  kill: { vibrate: [24, 24, 34], rumbleMs: 100, weak: 0.45, strong: 0.58, minIntervalMs: 80, priority: 4 },
  damage: { vibrate: [48, 24, 42], rumbleMs: 115, weak: 0.5, strong: 0.72, minIntervalMs: 90, priority: 5 },
  explosion: { vibrate: [90, 32, 65, 28, 38], rumbleMs: 220, weak: 0.75, strong: 0.95, minIntervalMs: 140, priority: 6 },
  slide: { vibrate: 20, rumbleMs: 65, weak: 0.25, strong: 0.15, minIntervalMs: 180, priority: 2 },
  land: { vibrate: 16, rumbleMs: 45, weak: 0.2, strong: 0.25, minIntervalMs: 150, priority: 1 },
  reload: { vibrate: 14, rumbleMs: 36, weak: 0.22, strong: 0.1, minIntervalMs: 120, priority: 1 },
  ui: { vibrate: 12, rumbleMs: 28, weak: 0.16, strong: 0.08, minIntervalMs: 40, priority: 1 },
};

let lastVibrateMs = 0;
let lastPriority = 0;
const dispatchedEventIds = new Set<number>();

export function isWebVibrationSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function triggerWebVibrate(pattern: number | number[], minIntervalMs = 40, priority = 1): boolean {
  if (!isWebVibrationSupported()) return false;
  const now = performance.now();
  if (now - lastVibrateMs < minIntervalMs && priority <= lastPriority) {
    return false;
  }
  try {
    const ok = navigator.vibrate(pattern);
    if (ok) {
      lastVibrateMs = now;
      lastPriority = priority;
    }
    return ok;
  } catch {
    return false;
  }
}

export function triggerGamepadRumble(
  durationMs: number,
  weakMagnitude: number,
  strongMagnitude: number
): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return false;
  try {
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad || !pad.connected) continue;
      const actuator = pad.vibrationActuator as
        | { playEffect?: (type: string, params: Record<string, number>) => Promise<unknown> }
        | undefined;
      if (actuator && typeof actuator.playEffect === 'function') {
        void actuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: Math.max(10, Math.round(durationMs)),
          weakMagnitude: Math.max(0, Math.min(1, weakMagnitude)),
          strongMagnitude: Math.max(0, Math.min(1, strongMagnitude)),
        });
        return true;
      }
    }
  } catch {
    // Haptics blocked or unsupported on this controller/browser
  }
  return false;
}

export function triggerHapticFeedback(
  kind: HapticEventKind,
  options?: {
    enabled?: boolean;
    intensity?: number;
    enableWebVibration?: boolean;
    enableGamepadRumble?: boolean;
    eventId?: number;
  }
): void {
  if (options?.enabled === false) return;
  if (options?.eventId !== undefined) {
    if (dispatchedEventIds.has(options.eventId)) return;
    dispatchedEventIds.add(options.eventId);
    if (dispatchedEventIds.size > 128) {
      const first = dispatchedEventIds.values().next().value;
      if (first !== undefined) dispatchedEventIds.delete(first);
    }
  }

  const spec = HAPTIC_SPECS[kind];
  const scale = Math.max(0.2, Math.min(1.2, options?.intensity ?? 1));

  if (options?.enableWebVibration !== false) {
    const pattern = Array.isArray(spec.vibrate)
      ? spec.vibrate.map((ms, idx) => (idx % 2 === 0 ? Math.max(8, Math.round(ms * scale)) : ms))
      : Math.max(8, Math.round(spec.vibrate * scale));
    triggerWebVibrate(pattern, spec.minIntervalMs, spec.priority);
  }

  if (options?.enableGamepadRumble !== false) {
    triggerGamepadRumble(spec.rumbleMs, spec.weak * scale, spec.strong * scale);
  }
}

export function cancelHapticFeedback(): void {
  if (isWebVibrationSupported()) {
    try {
      navigator.vibrate(0);
    } catch {
      // ignore
    }
  }
}
