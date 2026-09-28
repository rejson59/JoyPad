import { useEffect, useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { padClient, type PadClientState } from '../net/padClient';
import { normalizeNick } from '../net/protocol';
import { haptic } from './haptics';
import { useT } from '../platform/i18n';
/** Nickname editing starts after welcome; it does not disconnect or change the player slot. */
export function NickEditor({ st, compact = false }: { st: PadClientState; compact?: boolean }) {
  const { language, t } = useT();
  const fallbackName = `${language === 'en' ? 'Player' : 'Gracz'} ${st.slot + 1}`;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(st.nick || st.name || fallbackName);
  useEffect(() => {
    if (!editing) setDraft(st.nick || st.name || fallbackName);
  }, [editing, st.name, st.nick, fallbackName]);

  const save = () => {
    const next = normalizeNick(draft, st.nick || st.name || fallbackName);
    padClient.setNick(next);
    setDraft(next);
    setEditing(false);
    haptic(12);
  };

  return (
    <div className={`rounded-2xl border border-orange-400/20 bg-orange-500/[.07] ${compact ? 'p-3' : 'mt-4 p-3.5'}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-black tracking-[.18em] text-orange-200">{t('controller.nickTitle')}</div>
          <div className="mt-1 text-[10px] text-slate-400">{t('controller.nickDetail')}</div>
        </div>
        {!editing && <button type="button" onClick={() => setEditing(true)} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-orange-300/25 bg-orange-400/10 px-2.5 py-1.5 text-[11px] font-bold text-orange-100 hover:bg-orange-400/20"><Pencil size={13} /> {t('controller.editNick')}</button>}
      </div>
      {editing ? (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={draft}
            maxLength={14}
            onChange={e => setDraft(e.target.value.slice(0, 14))}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
            className="min-w-0 flex-1 rounded-lg border border-orange-300/40 bg-black/40 px-3 py-2 text-sm font-bold text-white outline-none focus:border-orange-300"
            aria-label={t('controller.nickname')}
          />
          <button type="button" onClick={save} className="flex shrink-0 items-center gap-1 rounded-lg bg-orange-300 px-3 py-2 text-[11px] font-black text-[#071521]"><Check size={14} /> {t('controller.saveNick')}</button>
        </div>
      ) : <div className="mt-2 truncate text-lg font-black text-white">{st.nick || st.name || fallbackName}</div>}
    </div>
  );
}
