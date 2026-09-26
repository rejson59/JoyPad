import { getPreferences } from './preferences';
export type SystemCue = 'move' | 'confirm' | 'back' | 'join' | 'start' | 'finish';
let ctx: AudioContext | undefined;
let busyUntil = 0;
let priority = 0;
const voices = new Set<OscillatorNode>();
const notes: Record<SystemCue, number[]> = { move: [420], confirm: [520, 780], back: [390, 260], join: [390, 520, 780], start: [520, 780, 1040], finish: [780, 650, 520] };
/** No queues: navigation cannot stack over a join/start/result cue. */
export function systemSound(cue: SystemCue) {
  if (!getPreferences().sound || typeof window === 'undefined' || location.hash.startsWith('#pad')) return;
  const nextPriority = cue === 'move' ? 0 : cue === 'confirm' || cue === 'back' ? 1 : 2;
  if (performance.now() < busyUntil && nextPriority <= priority) return;
  try {
    ctx ??= new AudioContext();
    void ctx.resume().catch(() => {});
    if (ctx.state !== 'running') return; // Never queue a delayed sound before browser activation.
    for (const voice of voices) { try { voice.stop(); } catch { /* already stopped */ } }
    voices.clear();
    priority = nextPriority;
    busyUntil = performance.now() + notes[cue].length * 80 + 50;
    notes[cue].forEach((frequency, i) => {
      const osc = ctx!.createOscillator(); const gain = ctx!.createGain();
      const t = ctx!.currentTime + i * .08;
      osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, t);
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(.035, t + .012); gain.gain.exponentialRampToValueAtTime(.001, t + .075);
      osc.connect(gain); gain.connect(ctx!.destination); voices.add(osc); osc.start(t); osc.stop(t + .08);
      osc.onended = () => { voices.delete(osc); osc.disconnect(); gain.disconnect(); };
    });
  } catch { /* Sound is an enhancement. */ }
}
