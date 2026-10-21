/**
 * Wspólna oprawa rundy — jedyne miejsce, w którym powstaje HUD gry.
 *
 * Kiedyś każda gra składała swój pasek, karty graczy i nakładki samodzielnie:
 * arcade miało grafit z Tailwinda, Stalowy Front `zinc-900` z bursztynem i fontem
 * z czołgów. Efekt: po wejściu w rundę JoyPad znikał. Teraz wszystkie sześć gier
 * buduje HUD z tych samych komponentów, a tożsamość gry niesie wyłącznie akcent
 * (`--game-accent` z katalogu). Powierzchnie (szkło, krawędzie, cienie) należą do
 * `liquid.css`, układ i typografia do `gamehud.css`.
 *
 * Zasady dla nowych gier:
 *  - nie dokładaj własnych kolorów tła ani fontów — weź akcent z `catalog.ts`,
 *  - liczby (zegar, wynik) idą w `var(--font-mono)` z `tabular-nums`,
 *  - wszystko, co przykrywa arenę, wchodzi przez `RoundOverlay` (jedna zasłona),
 *  - komponenty są czysto prezentacyjne: stan i sterowanie zostają w grze.
 */
import type { CSSProperties, ReactNode } from 'react';

/** Minuty:sekundy — jeden format zegara dla wszystkich gier. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Rama rundy: tło systemu + akcent gry dostępny dla całego drzewa. */
export function RoundFrame({ accent, soft, className = '', style, children }: {
  accent: string; soft?: string; className?: string; style?: CSSProperties; children: ReactNode;
}) {
  return (
    <div
      className={`arcade-page flex h-screen min-h-[360px] flex-col overflow-hidden ${className}`}
      style={{ '--game-accent': accent, '--game-soft': soft || accent, ...style } as CSSProperties}
    >
      {children}
    </div>
  );
}

/** Pasek górny: tytuł i stan rundy, zegar pośrodku, ikony systemowe po prawej. */
export function RoundTopBar({ children, center, actions }: { children: ReactNode; center?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="arcade-hudbar z-20 flex shrink-0 items-center justify-between gap-2 px-3 py-2 sm:px-5">
      <div className="arcade-hudgroup">{children}</div>
      {center && <div className="arcade-hudgroup">{center}</div>}
      {actions && <div className="arcade-actions">{actions}</div>}
    </div>
  );
}

export function RoundTitle({ children }: { children: ReactNode }) {
  return <div className="arcade-title truncate">{children}</div>;
}

/** Pigułka stanu (mapa, tryb, cel, format) — ten sam kształt w każdej grze. */
export function RoundChip({ icon, tone = 'plain', optional = false, children }: {
  icon?: ReactNode; tone?: 'plain' | 'accent' | 'danger' | 'success' | 'quiet'; optional?: boolean; children: ReactNode;
}) {
  return <span className={`arcade-chip${tone === 'plain' ? '' : ` is-${tone}`}${optional ? ' is-optional' : ''}`}>{icon}{children}</span>;
}

export function RoundTimer({ seconds, urgent = false, icon }: { seconds: number; urgent?: boolean; icon?: ReactNode }) {
  return <div className={`arcade-timer${urgent ? ' is-urgent' : ''}`}>{icon}{formatClock(seconds)}</div>;
}

/** Ikona systemowa (dźwięk, pady, pauza, koniec rundy, powrót do biblioteki). */
export function RoundIconButton({ label, onClick, tone = 'plain', active = false, badge, children }: {
  label: string; onClick: () => void; tone?: 'plain' | 'accent' | 'danger'; active?: boolean; badge?: number | string; children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active ? true : undefined}
      className={`arcade-icon${tone === 'plain' ? '' : ` is-${tone}`}${active ? ' is-active' : ''}`}
    >
      {children}
      {badge !== undefined && <span className="arcade-badge">{badge}</span>}
    </button>
  );
}

/** Obszar areny: płótno plus pływające notatki. `crt` zostawia tożsamość czołgów. */
export function RoundArena({ crt = false, className = '', children }: { crt?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={`arcade-arena ${crt ? 'scanlines crt-vignette ' : ''}relative min-h-0 flex-1 ${className}`}>
      {children}
    </div>
  );
}

export function RoundObjective({ children }: { children: ReactNode }) {
  return <div className="arcade-hudnote arcade-objective lg-enter pointer-events-none">{children}</div>;
}

/** Karta trzymanego bonusu/przedmiotu (arcade) — kolor niesie silnik gry. */
export function RoundPowerUp({ kicker, label, count, color, hint, rolling = false }: {
  kicker: ReactNode; label: string; count: number; color: string; hint: string; rolling?: boolean;
}) {
  return (
    <div className={`arcade-powerup lg-enter${rolling ? ' animate-pulse' : ''}`} style={{ borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, boxShadow: `0 18px 40px -20px ${color}` } as CSSProperties}>
      <div className="arcade-powerup-kicker">{kicker}</div>
      <div className="arcade-powerup-name">
        <b className="truncate" style={{ color }}>{label}</b>
        {count > 1 && <span className="arcade-powerup-count" style={{ background: color }}>×{count}</span>}
      </div>
      <div className="arcade-powerup-hint">{hint}</div>
    </div>
  );
}

export function RoundCountdown({ value, kicker }: { value: number; kicker: string }) {
  return (
    <div className="arcade-count">
      <span className="arcade-count-kicker">{kicker}</span>
      <span key={Math.ceil(value)} className="arcade-count-value count-pop">{Math.ceil(value)}</span>
    </div>
  );
}

export function RoundStartFlash() {
  return <div className="arcade-startflash"><span className="start-flash">START</span></div>;
}

export function RoundLoading({ children }: { children: ReactNode }) {
  return <div className="arcade-loading">{children}</div>;
}

/** Dolny pokład z kartami graczy (albo kolumna boczna — te same karty). */
export function RoundDeck({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`arcade-huddeck lg-enter z-10 flex shrink-0 gap-2 overflow-x-auto p-2 sm:justify-center sm:p-3 ${className}`}>{children}</div>;
}

export interface RoundCardData {
  name: string;
  color: string;
  score?: number;
  scoreLabel?: ReactNode;
  detail?: ReactNode;
  /** Pasek postępu (HP, energia, boost, okrążenie) — 0..maxValue. */
  value?: number;
  maxValue?: number;
  /** Kolor paska inny niż kolor gracza (np. HP przechodzące w czerwień). */
  meterColor?: string;
  isBot?: boolean;
  /** Znacznik po prawej (telefon, fragi/limit, „+3”). */
  meta?: ReactNode;
  /** Ikona przy imieniu: bot, telefon albo pad. */
  icon?: ReactNode;
  /** Wiersz pod paskiem: HP, odrodzenie, ikony bonusów. */
  footer?: ReactNode;
  /** Postęp do limitu (fragi w deathmatchu) — kropki w kolorze gracza. */
  pips?: { total: number; filled: number };
  dimmed?: boolean;
  strip?: boolean;
}

export function RoundPlayerCard({ name, color, score, scoreLabel, detail, value, maxValue, meterColor, isBot, meta, icon, footer, pips, dimmed = false, strip = false }: RoundCardData) {
  const pct = value === undefined ? undefined : Math.max(0, Math.min(100, (value / (maxValue || 100)) * 100));
  return (
    <div className={`arcade-hudcard arcade-card relative overflow-hidden${dimmed ? ' is-down' : ''}`}>
      {strip && <div className="arcade-card-strip" style={{ background: color }} />}
      <div className={strip ? 'arcade-card-body' : undefined}>
        <div className="arcade-card-head">
          <span className="arcade-card-name" style={{ color: dimmed ? undefined : color }}>
            {icon}<span>{name}</span>
            {isBot && <em className="arcade-card-bot">BOT</em>}
          </span>
          {score !== undefined ? <b className="arcade-card-score" style={{ color }}>{scoreLabel ?? score}</b> : meta}
        </div>
        {detail && <div className="arcade-card-detail">{detail}</div>}
        {score !== undefined && meta && <div className="arcade-card-meta">{meta}</div>}
        {pct !== undefined && <div className="arcade-meter"><i style={{ width: `${pct}%`, background: meterColor || color }} /></div>}
        {pips && <div className="arcade-pips">{Array.from({ length: pips.total }, (_, index) => <i key={index} style={{ background: index < pips.filled ? color : undefined }} />)}</div>}
        {footer && <div className="arcade-card-footer">{footer}</div>}
      </div>
    </div>
  );
}

/** Kolumna boczna (Stalowy Front trzyma w niej karty i podpowiedzi). */
export function RoundSide({ side, children }: { side: 'left' | 'right'; children: ReactNode }) {
  return <aside className={`arcade-side is-${side} z-10`}>{children}</aside>;
}

/**
 * Panel informacyjny: taktyka, bonusy, legenda jednego gracza.
 * `color` barwi tytuł (kolor gracza), `accent` podświetla krawędź, `span` rozciąga
 * panel na całą siatkę pomocy, `bodyRow` zamienia treść w wiersz opis–klawisze.
 */
export function RoundInfoCard({ title, icon, color, accent = false, span = false, bodyRow = false, children }: {
  title: ReactNode; icon?: ReactNode; color?: string; accent?: boolean; span?: boolean; bodyRow?: boolean; children: ReactNode;
}) {
  return (
    <div className={`arcade-info${accent ? ' is-accent' : ''}${span ? ' is-span' : ''}`}>
      <div className="arcade-info-title" style={color ? { color } : undefined}>{icon}{title}</div>
      <div className={`arcade-info-body${bodyRow ? ' arcade-help-row' : ''}`}>{children}</div>
    </div>
  );
}

/** Wynik w nagłówku karty: ikona, liczba i dopisek (limit fragów albo życia). */
export function RoundCardScore({ icon, value, extra }: { icon?: ReactNode; value: ReactNode; extra?: ReactNode }) {
  return <span className="arcade-card-meta">{icon}{value}{extra}</span>;
}

/** Ikony aktywnych bonusów w stopce karty. */
export function RoundBuffs({ children }: { children: ReactNode }) {
  return <span className="arcade-buffs">{children}</span>;
}

export function RoundInfoRow({ mark, children }: { mark: string; children: ReactNode }) {
  return <div className="arcade-info-row"><span className="arcade-info-mark">{mark}</span> {children}</div>;
}

/** Kilka klawiszy obok siebie („przód / tył”). */
export function RoundKeySet({ children }: { children: ReactNode }) {
  return <span className="arcade-info-row">{children}</span>;
}

/** Wiersz legendy sterowania: opis po lewej, klawisze po prawej. */
export function RoundHelpRow({ label, labelColor, keys = true, children }: {
  label: ReactNode; labelColor?: string; keys?: boolean; children: ReactNode;
}) {
  return (
    <div className="arcade-help-row">
      {labelColor ? <b style={{ color: labelColor }}>{label}</b> : <span>{label}</span>}
      {keys ? <RoundKeySet>{children}</RoundKeySet> : children}
    </div>
  );
}

/** Jedna zasłona dla wszystkich nakładek w rundzie (pady, sterowanie, pomoc). */
export function RoundOverlay({ onClose, wide = false, label, children }: {
  onClose: () => void; wide?: boolean; label?: string; children: ReactNode;
}) {
  return (
    <div className="arcade-overlay" onClick={onClose} role="presentation" aria-label={label}>
      <div className={`arcade-overlay-card${wide ? ' is-wide' : ''}`} onClick={event => event.stopPropagation()} role="presentation">
        {children}
      </div>
    </div>
  );
}

/** Feed zdarzeń (fragi w Stalowym Froncie) — pigułki nad areną. */
export function RoundFeed({ items }: { items: Array<{ id: number | string; killer: ReactNode; victim: ReactNode; icon?: ReactNode; separator?: ReactNode }> }) {
  if (!items.length) return null;
  return (
    <div className="arcade-feed">
      {items.map(item => (
        <div key={item.id} className="arcade-feed-row feed-in">
          {item.icon}<span>{item.killer}</span>{item.separator}<span className="is-victim">{item.victim}</span>
        </div>
      ))}
    </div>
  );
}

/** Kompaktowe karty na telefonie (zamiast kolumn bocznych). */
export function RoundMini({ players }: { players: Array<{ id: number | string; name: string; color: string; score: ReactNode; value?: number; maxValue?: number }> }) {
  if (!players.length) return null;
  return (
    <div className="arcade-mini">
      {players.map(player => (
        <div key={player.id} className="arcade-mini-card">
          <div className="arcade-mini-name" style={{ color: player.color }}>{player.name}</div>
          {player.value !== undefined && (
            <div className="arcade-meter" style={{ margin: '4px 0 2px' }}>
              <i style={{ width: `${Math.max(0, Math.min(100, (player.value / (player.maxValue || 100)) * 100))}%`, background: player.color }} />
            </div>
          )}
          <div className="arcade-mini-score">{player.score}</div>
        </div>
      ))}
    </div>
  );
}

/** Pasek klawiszy pod areną (duży ekran): kto jakie ma sterowanie. */
export function RoundKeys({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="arcade-keys z-20">
      {children}
      {hint && <span className="arcade-keys-hint">{hint}</span>}
    </div>
  );
}

export function RoundKeyGroup({ color, name, children }: { color: string; name: ReactNode; children: ReactNode }) {
  return (
    <div className="arcade-keygroup">
      <span className="arcade-keydot" style={{ background: color }} />
      <b style={{ color }}>{name}</b>
      {children}
    </div>
  );
}

export function RoundKeyCap({ children, fire = false }: { children: ReactNode; fire?: boolean }) {
  return <span className={`keycap${fire ? ' is-fire' : ''}`}>{children}</span>;
}

/** Siatka treści w nakładce (np. sterowanie każdego gracza obok siebie). */
export function RoundOverlayGrid({ children }: { children: ReactNode }) {
  return <div className="arcade-help">{children}</div>;
}

/** Znacznik gracza z telefonu (przy karcie albo w pasku klawiszy). */
export function RoundPhoneTag({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return <span className="arcade-phone">{icon}{children}</span>;
}
