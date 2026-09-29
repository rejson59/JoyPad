import { systemSound } from '../console/sound';
import { useEffect, useRef, useState } from 'react';
import { Check, Gamepad2, Sparkles, X } from 'lucide-react';
import type { SessionState } from '../net/protocol';
import { gameInfo, localizeGame } from '../arcade/catalog';
import { t as translateMessage, useLanguage } from './i18n';

type Notice = { id: number; title: string; detail?: string; kind: 'player' | 'success' | 'system' };
const listeners = new Set<(notice: Notice) => void>();
let serial = 0;
/** One bounded, non-blocking system channel. Never put game-frame events here. */
export function notify(title: string, detail?: string, kind: Notice['kind'] = 'system') {
  const notice = { id: ++serial, title, detail, kind };
  listeners.forEach(fn => fn(notice));
}
export function ToastViewport() {
  const [items, setItems] = useState<Notice[]>([]);
  const language = useLanguage();
  useEffect(() => {
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    const receive = (notice: Notice) => {
      setItems(old => [...old.slice(-2), notice]);
      timers.set(notice.id, setTimeout(() => { setItems(old => old.filter(n => n.id !== notice.id)); timers.delete(notice.id); }, 5000));
    };
    listeners.add(receive);
    return () => { listeners.delete(receive); timers.forEach(clearTimeout); };
  }, []);
  return <aside className="joy-notifications" aria-label={translateMessage(language, 'notifications.aria')} aria-live="polite" aria-relevant="additions">
    {items.map(item => <div key={item.id} className="joy-toast" role="status"><span className="joy-toast-icon">{item.kind === 'player' ? <Gamepad2 size={19} /> : item.kind === 'success' ? <Check size={19} /> : <Sparkles size={19} />}</span><div><b>{item.title}</b>{item.detail && <p>{item.detail}</p>}</div><button aria-label={translateMessage(language, 'notifications.close')} onClick={() => setItems(old => old.filter(n => n.id !== item.id))}><X size={15} /></button></div>)}
  </aside>;
}
export function SessionNotifications({ session }: { session: SessionState }) {
  const previous = useRef<SessionState | null>(null);
  const language = useLanguage();
  useEffect(() => {
    const before = previous.current;
    previous.current = session;
    if (!before) return;
    const text = (key: string, values?: Record<string, string | number>) => translateMessage(language, key, values);
    for (const p of session.roster) {
      const old = before.roster.find(o => o.slot === p.slot);
      if (!old) {
        systemSound('join');
        notify(text('notifications.playerJoined', { name: p.nick }), text('notifications.playerConnected', { n: p.slot + 1 }), 'player');
      }
      else if (p.suggestedGame && p.suggestedGame !== old.suggestedGame) notify(text('notifications.suggestsGame', { name: p.nick }), localizeGame(gameInfo(p.suggestedGame), language).title);
      else if (p.ready && !old.ready) notify(text('notifications.ready', { name: p.nick }), text('notifications.readyDetail'), 'success');
    }
    for (const p of before.roster) if (!session.roster.some(o => o.slot === p.slot)) notify(text('notifications.playerLeft', { name: p.nick }), text('notifications.returnDetail'), 'player');
    if (before.adminSlot !== session.adminSlot && session.adminSlot !== null) notify(text('notifications.newAdmin'), session.roster.find(p => p.slot === session.adminSlot)?.nick);
    if (before.room?.locked !== session.room?.locked) notify(session.room?.locked ? text('notifications.roomLocked') : text('notifications.roomOpen'));
    if (before.room?.suggestions !== session.room?.suggestions) notify(session.room?.suggestions ? text('notifications.suggestionsOn') : text('notifications.suggestionsOff'));
  }, [session, language]);
  return null;
}
