import type { ReplayClip } from './replayRecorder';
import type { GameId } from '../arcade/catalog';
import type { PadFx } from '../net/protocol';
import type { Language } from './i18n';

export interface MomentEvent { kind: 'kill' | 'streak' | 'lead' | 'lap' | 'score' | 'pickup' | 'objective'; slot: number; title: string; detail: string; at?: number; weight?: number }
export interface Moment extends MomentEvent { replay?: ReplayClip; id: number; at: number; weight: number; name: string; color: string }
interface Player { slot: number; name: string; color: string; score: number; detail?: string }
interface Snapshot { timeLeft: number; countdown: number; paused: boolean; players: Player[] }

/** In-memory telemetry, never video. One recorder per round; at most 64 events. */
export class MomentRecorder {
  private events: Moment[] = [];
  private players = new Map<number, Player>();
  private scores = new Map<number, number>();
  private lastKill = new Map<number, { at: number; count: number }>();
  private remaining: number | null = null;
  private elapsed = 0;
  private serial = 0;
  private leader: number | null = null;
  constructor(private game: GameId, private onEvent?: (moment: Moment, highlights: Moment[]) => void, private language: Language = 'pl') {}

  observe(hud: Snapshot) {
    if (!Number.isFinite(hud.timeLeft)) return;
    if (!hud.paused && hud.countdown <= 0 && this.remaining !== null) this.elapsed += Math.max(0, this.remaining - hud.timeLeft);
    this.remaining = hud.timeLeft;
    for (const p of hud.players) {
      this.players.set(p.slot, { ...p });
      const previous = this.scores.get(p.slot);
      if (previous !== undefined && p.score > previous && hud.countdown <= 0 && !hud.paused) {
        if (this.game === 'race') this.record({ kind: 'lap', slot: p.slot, title: this.language === 'en' ? 'Another lap' : 'Kolejne okrążenie', detail: p.detail || (this.language === 'en' ? `Race progress: ${p.score}` : `Postęp wyścigu: ${p.score}`), weight: 65 });
        else if (!['tanks', 'orbit'].includes(this.game)) this.record({ kind: 'score', slot: p.slot, title: this.language === 'en' ? 'Turning point' : 'Punkt zwrotny', detail: `+${p.score - previous} · ${this.language === 'en' ? 'score' : 'wynik'} ${p.score}`, weight: 45 });
      }
      this.scores.set(p.slot, p.score);
    }
    // Scores do not represent race positions or a cooperative team's leadership.
    if (['tanks', 'snake', 'league'].includes(this.game)) {
      const sorted = [...hud.players].sort((a, b) => b.score - a.score);
      const top = sorted[0];
      if (top && top.score > 0 && (!sorted[1] || top.score > sorted[1].score)) {
        if (this.leader !== null && this.leader !== top.slot) this.record({ kind: 'lead', slot: top.slot, title: this.language === 'en' ? 'Lead change' : 'Zmiana lidera', detail: this.language === 'en' ? `${top.name} takes the lead with ${top.score} points.` : `${top.name} przejmuje prowadzenie z wynikiem ${top.score}.`, weight: 90 });
        this.leader = top.slot;
      }
    }
  }

  fx(slot: number, fx: PadFx) {
    if (fx === 'kill') {
      const old = this.lastKill.get(slot);
      const count = old && this.elapsed - old.at <= 12 ? old.count + 1 : 1;
      // A growing combo is one story, not three cards showing the same streak.
      if (old && count > 1) this.events = this.events.filter(e => !(e.slot === slot && (e.kind === 'kill' || e.kind === 'streak') && Math.abs(e.at - old.at) < .5));
      this.lastKill.set(slot, { at: this.elapsed, count });
      this.record({ kind: count > 1 ? 'streak' : 'kill', slot, title: count > 1 ? (this.language === 'en' ? `Streak ×${count}` : `Seria ×${count}`) : this.game === 'orbit' ? (this.language === 'en' ? 'Target down' : 'Cel zestrzelony') : (this.language === 'en' ? 'Target eliminated' : 'Cel wyeliminowany'), detail: count > 1 ? (this.language === 'en' ? `${count} eliminations in a streak, with gaps up to 12 seconds.` : `${count} eliminacje w serii, z przerwami do 12 sekund.`) : (this.language === 'en' ? 'Successful action confirmed by the game engine.' : 'Skuteczna akcja potwierdzona przez silnik gry.'), weight: count > 1 ? 100 + count : 55 });
    }
    if (fx === 'pickup') this.record({ kind: 'pickup', slot, title: this.language === 'en' ? 'Power-up collected' : 'Bonus przejęty', detail: this.language === 'en' ? 'This pickup opens up new possibilities.' : 'Zebrany przedmiot daje nowe możliwości.', weight: 20 });
  }

  record(event: MomentEvent) {
    const p = this.players.get(event.slot);
    if (!p) return;
    const at = Number.isFinite(event.at) ? Math.max(0, event.at!) : this.elapsed;
    // Suppress repeating low-value pickups; allow meaningful streak upgrades.
    if (event.kind === 'pickup' && this.events.some(e => e.slot === event.slot && e.kind === event.kind && Math.abs(e.at - at) < 10)) return;
    const moment: Moment = { ...event, id: ++this.serial, at, weight: event.weight ?? 70, name: p.name, color: p.color };
    this.events.push(moment);
    if (this.events.length > 64) {
      const weakest = this.events.reduce((a, e, i, arr) => e.weight < arr[a].weight ? i : a, 0);
      this.events.splice(weakest, 1);
    }
    this.onEvent?.(moment, this.highlights());
  }

  highlights(limit = 3): Moment[] {
    const selected: Moment[] = [];
    for (const event of [...this.events].sort((a, b) => b.weight - a.weight || b.at - a.at)) {
      if (selected.some(p => p.slot === event.slot && Math.abs(p.at - event.at) < 10)) continue;
      selected.push({ ...event });
      if (selected.length >= Math.max(1, limit)) break;
    }
    return selected.sort((a, b) => a.at - b.at);
  }
}
export function momentTime(seconds: number) { return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`; }
