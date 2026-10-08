import { createContext, useContext, type CSSProperties, type ReactElement } from 'react';
import { JoyPadLogo } from '../components/JoyPadLogo';
import { QrFrame } from '../components/QrFrame';
import { PLAYER_DEFS } from '../game/types';
import { GAMES, gameInfo, localizeGame, type GameId } from '../arcade/catalog';
import { clamp01, lerp } from '../console/plamek';
import { CinemaPlamek } from './CinemaPlamek';
import { ControllerMock, PadUi, PhoneMock, TvMock, VideoPane } from './mocks';
import { pick, type Lang, type Text, type ViewId } from './script';
import { lerp as mix, readCue, seededUnit, type CueState, type FilmFrame, type QualityTier, type TimedScene } from './timeline';

/**
 * Sceny filmu — kompozycje w jednostkach 1920×1080.
 *
 * Zasada: **czas idzie z osi** (`frame`), a wygląd z klas CSS. To, co płynne
 * (przesuw półki, lot kontrolera, sweep joysticka, orbita Plamka), liczymy
 * w JS z postępu `cue`; cała reszta (wejścia tekstu, kafelki, karty) to jedna
 * klasa `is-in` przełączana w chwili startu cue — animację robi wtedy CSS,
 * czyli GPU, a nie React w każdej klatce.
 */

export interface LiveData {
  /** Gotowy kod QR (data URL) — prawdziwy pokój, jeśli jest; inaczej zaproszenie. */
  qr: string;
  code: string;
  /** Gracze podłączeni TERAZ — film pokazuje prawdę, nie makietę. */
  players: { name: string; color: string }[];
  ready: boolean;
}

export interface SceneProps {
  frame: FilmFrame;
  scene: TimedScene;
  language: Lang;
  tier: QualityTier;
  live: LiveData;
  /** Skala urządzenia (dpr × skala sceny) — Plamek liczy z niej wygładzenie krawędzi. */
  deviceScale: number;
}

const STAGE = { width: 1920, height: 1080 };

/**
 * Język filmu wędruje przez kontekst: sceny są kompozycjami, a nie miejscami,
 * w których ktoś ma pamiętać o przekazaniu `language` do każdego napisu.
 */
const FilmLanguage = createContext<Lang>('pl');
export const FilmLanguageProvider = FilmLanguage.Provider;
/** Zamiana pary { pl, en } na tekst w języku filmu. */
export function useFilmText(): (text?: Text) => string {
  const language = useContext(FilmLanguage);
  return (text?: Text) => pick(text, language);
}
const ORANGE = '#f6ad55';
const INK_DARK = '#120d0a';

/** Wyjazd drobiny: szybko, potem coraz wolniej (bez odbić). */
const fling = (distance: number, p: number) => distance * (1 - Math.pow(1 - clamp01(p), 3));
/** Kąt Plamka po rozbryzgu — wraca do zera razem z resztą ciała. */
const settleAngle = (away: number) => (away >= 1 ? 0 : -18 + away * 18);
/** Pasek przewijania powtórki: do 86% klipu, jak w prawdziwym odtwarzaczu. */
const scrubAt = (value: number) => lerp(0, .86, value);

/* ------------------------------------------------------------------ */
/* Klocki wspólne                                                      */
/* ------------------------------------------------------------------ */

function Words({ text, on, delay = 0, step = 68, className = '' }: { text: string | Text | undefined; on: boolean; delay?: number; step?: number; className?: string }) {
  const localized = useContext(FilmLanguage);
  const plain = typeof text === 'string' ? text : pick(text, localized);
  return (
    <span className={`film-words ${on ? 'is-in' : ''} ${className}`}>
      {plain.split(' ').map((word, index) => (
        <span className="film-word" key={`${word}-${index}`}>
          <i style={{ '--word-delay': `${delay + index * step}ms` } as CSSProperties}>{word}</i>
        </span>
      ))}
    </span>
  );
}

function Chips({ items, on, accent, delay = 0 }: { items: Text[]; on: boolean; accent: string; delay?: number }) {
  return (
    <div className={`film-chips ${on ? 'is-in' : ''}`}>
      {items.map((item, index) => (
        <span className="film-chip" key={`${item.en}-${index}`} style={{ '--chip-delay': `${delay + index * 110}ms`, '--chip-accent': accent } as CSSProperties}>
          <i aria-hidden="true" />
          <Localized text={item} />
        </span>
      ))}
    </div>
  );
}

/** Tekst w języku filmu — bez ręcznego przepisywania par w każdej scenie. */
function Localized({ text }: { text: Text }) {
  return <>{pick(text, useContext(FilmLanguage))}</>;
}

/** Etykieta + tytuł + zdanie + hasła. Jedna gramatyka dla całego filmu. */
function CopyBlock({
  scene, frame, accent, place = 'bottomLeft', tight = false, chips = true,
}: {
  scene: TimedScene; frame: FilmFrame; accent: string;
  place?: 'bottomLeft' | 'center'; tight?: boolean; chips?: boolean;
}) {
  const label = readCue(frame, 'label');
  const title = readCue(frame, 'title');
  const sub = readCue(frame, 'sub');
  const chipCue = readCue(frame, 'chips');
  return (
    <div className={`film-copy is-${place} ${tight ? 'is-tight' : ''}`} style={{ '--copy-accent': accent } as CSSProperties}>
      {scene.label && <span className={`film-label ${label.on ? 'is-in' : ''}`}><Localized text={scene.label} /></span>}
      {scene.title && <h2 className="film-title"><Words text={scene.title} on={title.on} /></h2>}
      {scene.sub && <p className={`film-sub ${sub.on ? 'is-in' : ''}`}><Localized text={scene.sub} /></p>}
      {chips && scene.chips && <Chips items={scene.chips} on={chipCue.on} accent={accent} />}
    </div>
  );
}

function Backdrop({ accent, grid = false, intensity = 1 }: { accent: string; grid?: boolean; intensity?: number }) {
  return (
    <div className="film-backdrop" style={{ '--scene-accent': accent, '--backdrop-power': String(intensity) } as CSSProperties} aria-hidden="true">
      <span className="film-backdrop-base" />
      {grid && <span className="film-backdrop-grid" />}
      <span className="film-backdrop-glow" />
      <span className="film-backdrop-horizon" />
    </div>
  );
}

/** Iskry rozbryzgu: pozycje z deterministycznego „losu", więc eksport i podgląd się zgadzają. */
function Sparks({ x, y, p, count = 14, spread = 300, accent, salt = 3 }: { x: number; y: number; p: number; count?: number; spread?: number; accent: string; salt?: number }) {
  if (p <= 0 || p >= 1) return null;
  return (
    <div className="film-sparks" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => {
        const angle = seededUnit(index, salt) * Math.PI * 2;
        const speed = .35 + seededUnit(index, salt + 1) * .65;
        const distance = fling(spread * speed, p);
        const size = 6 + seededUnit(index, salt + 2) * 12;
        return (
          <i
            key={index}
            style={{
              left: x, top: y, width: size, height: size * (.6 + seededUnit(index, salt + 3) * .8),
              background: accent,
              opacity: String((1 - p) * .9),
              transform: `translate3d(${(Math.cos(angle) * distance).toFixed(1)}px, ${(Math.sin(angle) * distance + 150 * p * p).toFixed(1)}px, 0) rotate(${(angle * 57).toFixed(0)}deg)`,
            } as CSSProperties}
          />
        );
      })}
    </div>
  );
}

function Ring({ x, y, p, from = 40, to = 460, accent, width = 3 }: { x: number; y: number; p: number; from?: number; to?: number; accent: string; width?: number }) {
  if (p <= 0 || p >= 1) return null;
  const size = lerp(from, to, p);
  return (
    <span
      className="film-ring"
      style={{ left: x, top: y, width: size, height: size, borderColor: accent, borderWidth: width, opacity: String((1 - p) * .8) } as CSSProperties}
      aria-hidden="true"
    />
  );
}

/* ------------------------------------------------------------------ */
/* 1. Iskra, upadek i Plamek                                           */
/* ------------------------------------------------------------------ */

function ColdOpenScene({ frame, scene, deviceScale }: SceneProps) {
  const ember = readCue(frame, 'ember');
  const drop = readCue(frame, 'drop');
  const splat = readCue(frame, 'splat');
  const reform = readCue(frame, 'reform');
  const word1 = readCue(frame, 'word1');
  const word2 = readCue(frame, 'word2');
  const kicker = readCue(frame, 'kicker');

  const startY = 296;
  const restY = 742;
  const r = lerp(5, 62, ember.p);
  const y = lerp(startY, restY, drop.p);
  const falling = drop.p > 0 && drop.p < 1;
  const flatten = splat.p > 0 && splat.p < 1 ? Math.sin(splat.p * Math.PI) : 0;
  const bodyR = lerp(r, lerp(r * 1.14, r, clamp01(splat.p)), clamp01(splat.p));
  const ready = reform.p >= 1;

  return (
    <div className="film-scene is-coldopen">
      <Backdrop accent={ORANGE} intensity={lerp(0, .9, Math.max(ember.p, splat.p))} />
      <span className="film-coldopen-glow" style={{ opacity: String(.25 + splat.p * .5), transform: `scale(${lerp(.5, 1.25, splat.p).toFixed(2)})` }} aria-hidden="true" />
      <span className="film-ember" style={{ left: 960, top: 296, opacity: String(ember.p), transform: `scale(${lerp(.2, 1, ember.p).toFixed(2)})` }} aria-hidden="true" />
      <Ring x={960} y={restY} p={splat.p} from={30} to={520} accent="rgba(246,173,85,.55)" width={2} />
      <Sparks x={960} y={restY} p={splat.p} count={16} spread={340} accent="rgba(246,173,85,.75)" />
      <CinemaPlamek
        x={960}
        y={y}
        r={bodyR}
        sx={falling ? .82 : lerp(1, 1 + flatten * .6, clamp01(reform.p))}
        sy={falling ? 1.26 : lerp(1, 1 - flatten * .5, clamp01(reform.p))}
        tail={falling ? 46 : 0}
        angle={90}
        wob={ready ? .35 : .12}
        spin={frame.t / 900}
        mood={ready ? 'happy' : 'calm'}
        blink={ready && Math.sin(frame.t / 340) > .93 ? 1 : 0}
        gaze={{ x: 0, y: ready ? -.5 : 0 }}
        splats={flatten > 0 ? [
          { x: -170 * flatten, y: 40 + 22 * flatten, r: 13 },
          { x: 158 * flatten, y: 34 + 20 * flatten, r: 10 },
          { x: 86 * flatten, y: -44 - 14 * flatten, r: 7 },
        ] : []}
        paint={ORANGE}
        weight={.55}
        deviceScale={deviceScale}
      />
      <div className="film-coldopen-copy">
        <h2 className="film-hero"><Words text={scene.extra?.word1} on={word1.on} step={110} /></h2>
        <h2 className="film-hero is-accent"><Words text={scene.extra?.word2} on={word2.on} step={110} /></h2>
        <span className={`film-kicker ${kicker.on ? 'is-in' : ''}`}><Localized text={scene.extra?.kicker ?? { pl: '', en: '' }} /></span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Biblioteka                                                       */
/* ------------------------------------------------------------------ */

const CARD = { width: 268, height: 372, spacing: 322, centerX: 1214, rowY: 424 };
const FOCUS_ORDER = [0, 2, 4];

function LibraryScene({ frame, scene, language, tier, deviceScale }: SceneProps) {
  const shelf = readCue(frame, 'shelf');
  const focus = readCue(frame, 'focus');
  const plamek = readCue(frame, 'plamek');
  const hop = focus.repeat;
  const floatIndex = hop === 0
    ? lerp(-2.1, FOCUS_ORDER[0], shelf.p)
    : lerp(FOCUS_ORDER[Math.max(0, Math.min(hop - 1, FOCUS_ORDER.length - 1))], FOCUS_ORDER[Math.min(hop, FOCUS_ORDER.length - 1)], focus.p);
  const moving = hop === 0 ? shelf.p < 1 : focus.p < 1;
  const drag = moving ? 42 : 0;

  return (
    <div className="film-scene is-library">
      <Backdrop accent={ORANGE} grid intensity={.7} />
      <div
        className="film-shelf"
        style={{
          transform: `translate3d(${(CARD.centerX - floatIndex * CARD.spacing).toFixed(1)}px, 0, 0)`,
          opacity: String(clamp01(shelf.p * 1.6)),
          filter: `blur(${((1 - clamp01(shelf.p * 1.3)) * 10).toFixed(1)}px)`,
        }}
      >
        {GAMES.map((game, index) => {
          const distance = Math.abs(index - floatIndex);
          const lit = clamp01(1 - distance / .62);
          const info = localizeGame(game, language);
          return (
            <div
              className={`film-card ${lit > .5 ? 'is-lit' : ''}`}
              key={game.id}
              style={{
                left: index * CARD.spacing, top: CARD.rowY - CARD.height / 2, width: CARD.width, height: CARD.height,
                transform: `perspective(1600px) rotateY(${(distance * -2.1).toFixed(2)}deg) scale(${lerp(.9, 1.06, lit).toFixed(3)}) translateY(${(-14 * lit).toFixed(1)}px)`,
                '--card-accent': game.accent,
                filter: `brightness(${lerp(.58, 1.04, lit).toFixed(2)}) saturate(${lerp(.75, 1, lit).toFixed(2)})`,
                zIndex: 10 + Math.round(lit * 10),
              } as CSSProperties}
            >
              <img src={`${import.meta.env.BASE_URL}${game.cover}`} alt="" />
              <span className="film-card-shade" />
              {game.wip && <span className="film-card-soon"><Localized text={scene.extra?.soonTag ?? { pl: 'ZAPOWIEDŹ', en: 'SOON' }} /></span>}
              <span className="film-card-number">{game.number}</span>
              <span className="film-card-meta"><b>{info.title}</b><small>{info.genre}</small></span>
              <span className="film-card-ring" style={{ opacity: lit.toFixed(2), borderColor: game.accent, boxShadow: `0 0 0 2px ${game.accent}, 0 30px 90px rgba(246,173,85,.35)` }} />
            </div>
          );
        })}
      </div>
      {tier !== 'static' && (
        <CinemaPlamek
          x={lerp(1180, CARD.centerX, clamp01(shelf.p))}
          y={CARD.rowY - CARD.height / 2 - 58}
          r={38}
          sx={1 + drag / 240}
          sy={1 - drag / 420}
          tail={drag}
          angle={180}
          wob={.4}
          spin={frame.t / 1100}
          mood={moving ? 'curious' : 'happy'}
          blink={Math.sin(frame.t / 520) > .9 ? 1 : 0}
          gaze={{ x: 0, y: .6 }}
          opacity={clamp01(plamek.p * 1.2)}
          paint={ORANGE}
          weight={.45}
          deviceScale={deviceScale}
        />
      )}
      <CopyBlock scene={scene} frame={frame} accent={ORANGE} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Parowanie (prawdziwy kod QR)                                     */
/* ------------------------------------------------------------------ */

function PairScene({ frame, scene, tier, live }: SceneProps) {
  const L = useFilmText();
  const tv = readCue(frame, 'tv');
  const panel = readCue(frame, 'panel');
  const qr = readCue(frame, 'qr');
  const scan = readCue(frame, 'scan');
  const phone = readCue(frame, 'phone');
  const beam = readCue(frame, 'beam');
  const ping = readCue(frame, 'ping');
  const tvX = 640, tvY = 430;
  const qrX = 520, qrY = 430;
  const beamFrom = { x: 1400, y: 380 };
  const beamP = clamp01(beam.p * 1.05);
  const joined = live.players[0];

  return (
    <div className="film-scene is-pair">
      <Backdrop accent={ORANGE} grid intensity={.5} />
      <TvMock x={tvX} y={tvY} width={1000} height={566} rot={-1.2} className={tv.on ? 'is-in' : ''} glow="rgba(246,173,85,.3)">
        <div className="film-tv-content is-pairing">
          <div className="film-pair-head">
            <span className="film-pair-eyebrow"><Localized text={scene.label ?? { pl: '', en: '' }} /></span>
            <span className="film-pair-code"><Localized text={scene.extra?.codeLabel ?? { pl: 'KOD', en: 'CODE' }} /> · <b>{live.code}</b></span>
          </div>
          <div className={`film-pair-body ${panel.on ? 'is-in' : ''}`} style={{ opacity: String(clamp01(.25 + panel.p * 1.2)) }}>
            <div className={`film-qr ${qr.on ? 'is-in' : ''}`}>
              <QrFrame src={live.qr} size={252} loadingLabel={L(scene.extra?.waiting)} />
              <span className="film-qr-hint"><Localized text={scene.extra?.qrHint ?? { pl: '', en: '' }} /></span>
              <span className="film-qr-flash" style={{ opacity: String((1 - clamp01(qr.p)) * .45) }} />
            </div>
            <div className="film-pair-side">
              <ol className="film-pair-steps">
                {[1, 2, 3].map((step, index) => (
                  <li key={step} className={clamp01((panel.p - index * .14) * 3) > .5 ? 'is-in' : ''}>
                    <i>{step}</i>
                    <span><Localized text={scene.chips?.[index] ?? { pl: '', en: '' }} /></span>
                  </li>
                ))}
              </ol>
              {joined && (
                <span className="film-pair-joined" style={{ '--join-accent': joined.color } as CSSProperties}>
                  <i aria-hidden="true" />
                  <b>{joined.name}</b>
                  <small><Localized text={scene.extra?.joined ?? { pl: '', en: '' }} /></small>
                </span>
              )}
            </div>
          </div>
        </div>
      </TvMock>

      <PhoneMock x={1560} y={540} width={286} height={588} rot={lerp(-14, -4, phone.p)} scale={lerp(.82, 1, phone.p)} className={phone.on ? 'is-in' : ''} glow="rgba(125,211,252,.28)">
        <div className="film-phone-join">
          <span className={`film-phone-corners ${scan.on ? 'is-in' : ''}`} aria-hidden="true"><i /><i /><i /><i /></span>
          {ping.p > 0 && <>
            <Ring x={143} y={294} p={ping.p} from={40} to={420} accent="rgba(125,211,252,.6)" />
            <Ring x={143} y={294} p={clamp01(ping.p * 1.25 - .2)} from={30} to={330} accent="rgba(255,255,255,.35)" />
          </>}
          <span className={`film-phone-ok ${ping.on ? 'is-in' : ''}`}><Localized text={scene.extra?.joined ?? { pl: '', en: '' }} /></span>
        </div>
      </PhoneMock>

      {beamP > 0 && beamP < 1 && !tier.startsWith('static') && (
        <span
          className="film-beam"
          style={{
            left: beamFrom.x, top: beamFrom.y,
            width: Math.hypot(qrX + 160 - beamFrom.x, qrY - beamFrom.y) * beamP,
            transform: `rotate(${(Math.atan2(qrY - beamFrom.y, qrX + 160 - beamFrom.x) * 180 / Math.PI).toFixed(2)}deg)`,
          } as CSSProperties}
          aria-hidden="true"
        />
      )}
      <CopyBlock scene={scene} frame={frame} accent={ORANGE} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Kontroler wpada w telefon                                        */
/* ------------------------------------------------------------------ */

const PHONE = { x: 1250, y: 540, width: 640, height: 1010 };
const A_BUTTON = { x: PHONE.x + 206, y: PHONE.y + 372 };
const IMPACT_POINT = { x: PHONE.x - 8, y: PHONE.y - 44 };

function HandoffScene({ frame, scene, tier, deviceScale }: SceneProps) {
  const L = useFilmText();
  const screen = readCue(frame, 'screen');
  const padUi = readCue(frame, 'padUi');
  const flight = readCue(frame, 'controller');
  const impact = readCue(frame, 'impact');
  const ripple = readCue(frame, 'ripple');
  const splat = readCue(frame, 'splat');
  const reform = readCue(frame, 'reform');
  const stick = readCue(frame, 'stick');
  const press = readCue(frame, 'press');
  const ready = readCue(frame, 'ready');

  const from = { x: -320, y: 210, rot: -212, scale: 1.25 };
  const to = { x: PHONE.x - 40, y: PHONE.y - 96, rot: -6, scale: .52 };
  const hit = clamp01(impact.p);
  const padX = mix(from.x, to.x, flight.p);
  const padY = mix(from.y, to.y, flight.p);
  const padRot = mix(from.rot, to.rot, flight.p);
  const padScale = mix(from.scale, to.scale * .82, flight.p) * lerp(1, 1.26, hit) * lerp(1, .12, clamp01((hit - .5) / .5));
  const sweep = clamp01(stick.p);
  const settling = clamp01((sweep - .8) / .2);
  const stickPos = sweep >= 1
    ? { x: 0, y: -.86 }
    : {
      x: Math.cos(sweep * Math.PI * 2 - Math.PI / 2) * (1 - settling),
      y: Math.sin(sweep * Math.PI * 2 - Math.PI / 2) * (1 - settling) - settling * .86,
    };
  const pressPulse = press.p > 0 && press.p < 1 ? Math.sin(press.p * Math.PI) : 0;

  const away = clamp01(reform.p * 1.15);
  const plamekX = mix(IMPACT_POINT.x, A_BUTTON.x, away);
  const plamekY = mix(IMPACT_POINT.y, A_BUTTON.y - 26, away) - Math.sin(away * Math.PI) * 150;
  const splatting = splat.p > 0 && splat.p < 1;
  const splatK = Math.sin(clamp01(splat.p) * Math.PI);

  return (
    <div className="film-scene is-handoff">
      <Backdrop accent={ORANGE} intensity={.75} />
      <PhoneMock x={PHONE.x} y={PHONE.y} width={PHONE.width} height={PHONE.height} rot={lerp(-8, -1.4, screen.p)} scale={lerp(.94, 1, screen.p)} glow="rgba(246,173,85,.4)">
        <div className={`film-pad-screen ${padUi.on ? 'is-in' : ''}`}>
          <PadUi
            header={L(scene.extra?.padHeader)}
            ready={ready.on ? L(scene.extra?.ready) : undefined}
            stick={stickPos}
            pressA={pressPulse}
            vibrate={pressPulse}
          />
        </div>
        <span className="film-impact-flash" style={{ opacity: String(impact.on ? (1 - clamp01(impact.p * 1.6)) * .7 : 0) }} />
        <Ring x={IMPACT_POINT.x - PHONE.x + PHONE.width / 2} y={IMPACT_POINT.y - PHONE.y + PHONE.height / 2} p={ripple.p} from={60} to={780} accent="rgba(255,236,205,.5)" />
        <Ring x={IMPACT_POINT.x - PHONE.x + PHONE.width / 2} y={IMPACT_POINT.y - PHONE.y + PHONE.height / 2} p={clamp01(ripple.p * 1.2 - .18)} from={40} to={560} accent="rgba(246,173,85,.4)" />
      </PhoneMock>

      {tier === 'high' && flight.p > 0 && flight.p < 1 && (
        <div
          className="film-pad-flight"
          style={{
            left: padX, top: padY,
            transform: `translate(-50%, -50%) rotate(${padRot.toFixed(2)}deg) scale(${Math.max(.05, padScale).toFixed(3)})`,
            opacity: String(lerp(1, 0, clamp01((hit - .3) / .7))),
          } as CSSProperties}
        >
          <ControllerMock size={1} lit />
          <span className="film-pad-streak" aria-hidden="true" />
        </div>
      )}

      <Sparks x={IMPACT_POINT.x} y={IMPACT_POINT.y} p={ripple.p} count={12} spread={420} accent="rgba(255,226,184,.85)" salt={11} />
      {tier !== 'static' && splat.p > 0 && (
        <CinemaPlamek
          x={plamekX}
          y={plamekY}
          r={lerp(30, 44, away)}
          sx={splatting ? lerp(1, 1.75, splatK) : lerp(1.3, 1, clamp01(reform.p))}
          sy={splatting ? lerp(1, .52, splatK) : lerp(.7, 1 + Math.sin(clamp01(reform.p) * Math.PI) * .1, clamp01(reform.p))}
          tail={0}
          angle={settleAngle(away)}
          wob={away >= 1 ? .55 : .2}
          spin={frame.t / 700}
          mood={away >= 1 ? 'happy' : 'zoom'}
          blink={away >= 1 && Math.sin(frame.t / 420) > .88 ? 1 : 0}
          gaze={{ x: 0, y: away >= 1 ? .35 : -.2 }}
          splats={splatting ? [
            { x: -126, y: 22, r: 12 },
            { x: 118, y: 34, r: 9 },
            { x: -70, y: -66, r: 7 },
          ] : []}
          paint={ORANGE}
          weight={.6}
          deviceScale={deviceScale}
          opacity={clamp01(splat.p * 1.4)}
        />
      )}

      <span className={`film-handoff-tag film-label ${screen.on ? 'is-in' : ''}`}><Localized text={scene.extra?.zoom ?? { pl: '', en: '' }} /></span>
      <CopyBlock scene={scene} frame={frame} accent={ORANGE} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Runda (wspólny ekran)                                            */
/* ------------------------------------------------------------------ */

const TV_MAIN = { x: 700, y: 470, width: 1160, height: 652 };

function PlayScene({ frame, scene, tier }: SceneProps) {
  const L = useFilmText();
  const tv = readCue(frame, 'tv');
  const video = readCue(frame, 'video');
  const phone = readCue(frame, 'phone');
  const go = readCue(frame, 'go');
  const countdown: { id: string; cue: CueState }[] = [
    { id: 'n3', cue: readCue(frame, 'n3') }, { id: 'n2', cue: readCue(frame, 'n2') },
    { id: 'n1', cue: readCue(frame, 'n1') }, { id: 'go', cue: go },
  ];
  const active = countdown.find(item => item.cue.on && item.cue.v > 0) ?? null;
  const players = PLAYER_DEFS.slice(0, 4);
  const chipCues = ['p1', 'p2', 'p3', 'p4'].map(id => readCue(frame, id));

  return (
    <div className="film-scene is-play">
      <Backdrop accent={ORANGE} grid intensity={.6} />
      <div className="film-play-chips">
        {players.map((player, index) => (
          <span
            className={`film-player-chip ${chipCues[index].on ? 'is-in' : ''}`}
            key={player.id}
            style={{ '--player-color': player.color, '--chip-delay': `${index * 60}ms` } as CSSProperties}
          >
            <i aria-hidden="true" />
            <b>{player.name}</b>
            <small><Localized text={scene.extra?.readyChip ?? { pl: '', en: '' }} /></small>
          </span>
        ))}
      </div>
      <TvMock x={TV_MAIN.x} y={TV_MAIN.y} width={TV_MAIN.width} height={TV_MAIN.height} rot={-1} className={tv.on ? 'is-in' : ''}>
        <VideoPane stem="tanks" sceneId={scene.id} poster={gameInfo('tanks').cover} live={tier !== 'static' && video.p > .1} startAt={2.4} className="is-full">
          <span className="film-play-arena-label"><Localized text={scene.extra?.arenaLabel ?? { pl: '', en: '' }} /></span>
          <span className="film-play-frame" aria-hidden="true" />
        </VideoPane>
        {active && (
          <span className="film-countdown" style={{ opacity: String(active.cue.v), transform: `scale(${lerp(1.35, 1, active.cue.p).toFixed(3)})` }}>
            {active.id === 'go' ? L(scene.extra?.countdown) : active.id.slice(1)}
          </span>
        )}
        <span className="film-play-flash" style={{ opacity: String(go.p > 0 && go.p < 1 ? (1 - go.p) * .45 : 0) }} aria-hidden="true" />
      </TvMock>
      <PhoneMock x={1590} y={640} width={300} height={640} rot={lerp(22, 8, phone.p)} scale={lerp(.7, 1, phone.p)} className={phone.on ? 'is-in' : ''} glow="rgba(74,222,128,.3)">
        <div className="film-pad-screen is-small">
          <PadUi header={L(scene.extra?.arenaLabel)} stick={{ x: 0, y: -.78 }} small />
        </div>
      </PhoneMock>
      <CopyBlock scene={scene} frame={frame} accent={ORANGE} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Podzielony ekran                                                 */
/* ------------------------------------------------------------------ */

const PANE = { width: 870, height: 450 };
const PANES: { x: number; y: number; stem: GameId | null; player: number }[] = [
  { x: 510, y: 300, stem: 'tanks', player: 0 },
  { x: 1410, y: 300, stem: 'race', player: 1 },
  { x: 510, y: 780, stem: 'orbit', player: 2 },
  { x: 1410, y: 780, stem: null, player: 3 },
];

function SplitScene({ frame, scene, tier }: SceneProps) {
  const L = useFilmText();
  const tiles = readCue(frame, 'tiles');
  const seams = readCue(frame, 'seams');
  const menu = readCue(frame, 'menu');
  const stepCues = [readCue(frame, 'step1'), readCue(frame, 'step2'), readCue(frame, 'step3')];
  const fired = stepCues.filter(step => step.on).length;
  const last = stepCues[Math.max(0, fired - 1)];
  const ringFloat = fired === 0 ? 0 : fired - 1 + clamp01(last.p);
  const title = readCue(frame, 'title');
  const extra = scene.extra;
  const menuRows = [
    { label: extra?.row1, options: [extra?.optShared, extra?.optSplit], on: 1 },
    { label: extra?.row2, options: [extra?.optClassic, extra?.optTournament, extra?.optBalanced], on: 1 },
    { label: extra?.row3, options: [extra?.optPerf, extra?.optBalanced, extra?.optQuality], on: -1 },
  ];

  return (
    <div className="film-scene is-split">
      <Backdrop accent={ORANGE} intensity={.55} />
      <div className="film-grid-panes" style={{ opacity: String(clamp01(tiles.p * 1.6)) }}>
        {PANES.map((pane, index) => {
          const cue = readCue(frame, `t${index + 1}`);
          const player = PLAYER_DEFS[pane.player];
          return (
            <div
              className={`film-grid-pane ${cue.on ? 'is-in' : ''}`}
              key={index}
              style={{
                left: pane.x - PANE.width / 2, top: pane.y - PANE.height / 2, width: PANE.width, height: PANE.height,
                // Pozycja z zaciskiem: `outBack` rozciąga kształt, ale nigdy nie
                // może cofnąć kafla — ruch do przodu jest kontraktem tego filmu.
                transform: `translate3d(0, ${lerp(38, 0, clamp01(cue.p)).toFixed(1)}px, 0) scale(${lerp(.92, 1, cue.p).toFixed(3)})`,
                '--pane-accent': player.color,
                zIndex: index + 1,
              } as CSSProperties}
            >
              {pane.stem ? (
                <VideoPane
                  stem={pane.stem}
                  sceneId={scene.id}
                  poster={gameInfo(pane.stem).cover}
                  live={tier === 'high' && cue.p > .35}
                  startAt={1.2 + index * .7}
                  className="is-full"
                />
              ) : (
                <div className={`film-menu ${menu.on ? 'is-in' : ''}`}>
                  <span className="film-menu-title">{L(extra?.menuTitle)}</span>
                  {menuRows.map((row, rowIndex) => (
                    <span className={`film-menu-row ${Math.round(ringFloat) === rowIndex ? 'is-focused' : ''}`} key={rowIndex}>
                      <b>{L(row.label)}</b>
                      <span className="film-menu-options">
                        {row.options.map((option, optionIndex) => (
                          <em key={optionIndex} className={optionIndex === row.on ? 'is-on' : ''}>{L(option)}</em>
                        ))}
                      </span>
                    </span>
                  ))}
                  <span className="film-menu-hint">{L(extra?.tournament)}</span>
                </div>
              )}
              <span className="film-grid-corner" aria-hidden="true" />
              <span className="film-grid-player" style={{ '--player-color': player.color } as CSSProperties}><i aria-hidden="true" />P{index + 1}</span>
            </div>
          );
        })}
      </div>
      {seams.p > 0 && <span className="film-grid-seams" style={{ opacity: String(seams.p * .5) }} aria-hidden="true" />}
      <div className={`film-glass-card ${title.on ? 'is-in' : ''}`}>
        {scene.label && <span className="film-label is-in"><Localized text={scene.label} /></span>}
        {scene.title && <h2 className="film-title"><Words text={L(scene.title)} on={title.on} /></h2>}
        {scene.sub && <p className="film-sub is-in"><Localized text={scene.sub} /></p>}
        <Chips items={scene.chips ?? []} on={readCue(frame, 'chips').on} accent={ORANGE} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 7. Momenty                                                          */
/* ------------------------------------------------------------------ */

const FRAME_BOX = { x: 700, y: 372, width: 1180, height: 664 };
const BRACKET_WIDE = { x: 690, y: 300, width: 940, height: 540 };
const BRACKET_TIGHT = { x: 560, y: 316, width: 420, height: 268 };

function MomentsScene({ frame, scene, tier }: SceneProps) {
  const frameCue = readCue(frame, 'frame');
  const freeze = readCue(frame, 'freeze');
  const slowmo = readCue(frame, 'slowmo');
  const sweep = readCue(frame, 'sweep');
  const bracket = readCue(frame, 'bracket');
  const card = readCue(frame, 'card');
  const stamp = readCue(frame, 'stamp');
  const tags = readCue(frame, 'tags');
  const box = {
    x: mix(BRACKET_WIDE.x, BRACKET_TIGHT.x, bracket.p),
    y: mix(BRACKET_WIDE.y, BRACKET_TIGHT.y, bracket.p),
    width: mix(BRACKET_WIDE.width, BRACKET_TIGHT.width, bracket.p),
    height: mix(BRACKET_WIDE.height, BRACKET_TIGHT.height, bracket.p),
  };

  return (
    <div className="film-scene is-moments">
      <Backdrop accent={ORANGE} grid intensity={.4} />
      <div
        className={`film-frame ${frameCue.on ? 'is-in' : ''}`}
        style={{ left: FRAME_BOX.x - FRAME_BOX.width / 2, top: FRAME_BOX.y - FRAME_BOX.height / 2, width: FRAME_BOX.width, height: FRAME_BOX.height } as CSSProperties}
      >
        <VideoPane stem="tanks" sceneId={scene.id} poster={gameInfo('tanks').cover} live={tier !== 'static' && frameCue.p > .2} startAt={5.4} rate={.25} className="is-full" />
        <span className="film-frame-freeze" style={{ opacity: String(freeze.p > 0 && freeze.p < 1 ? .85 : 0) }} />
        <span className={`film-slowmo ${slowmo.on ? 'is-in' : ''}`}>0.25×</span>
        <span className="film-frame-grain" aria-hidden="true" />
      </div>
      <div className={`film-bracket ${bracket.on ? 'is-in' : ''}`} style={{ left: box.x - box.width / 2, top: box.y - box.height / 2, width: box.width, height: box.height } as CSSProperties}>
        <i /><i /><i /><i />
        <span className="film-bracket-tag"><Localized text={scene.extra?.freeze ?? { pl: '', en: '' }} /></span>
      </div>
      <div className="film-scrub" style={{ left: FRAME_BOX.x - FRAME_BOX.width / 2, top: FRAME_BOX.y + FRAME_BOX.height / 2 + 26, width: FRAME_BOX.width }}>
        <span className="film-scrub-track" />
        <span className="film-scrub-fill" style={{ width: `${(clamp01(scrubAt(sweep.p)) * 100).toFixed(1)}%` }} />
        <span className="film-scrub-head" style={{ left: `${(clamp01(scrubAt(sweep.p)) * 100).toFixed(1)}%` }} />
        <span className="film-scrub-label"><Localized text={scene.extra?.scrub ?? { pl: '', en: '' }} /></span>
      </div>
      <div className={`film-moment-card ${card.on ? 'is-in' : ''}`}>
        <span className="film-moment-thumb">
          <img src={`${import.meta.env.BASE_URL}${gameInfo('tanks').cover}`} alt="" />
          <i className="film-moment-play" aria-hidden="true" />
        </span>
        <span className="film-moment-meta">STALOWY FRONT · 0:08 · 720p</span>
        <span className="film-moment-tags"><Localized text={scene.extra?.tags ?? { pl: '', en: '' }} /></span>
        <span className={`film-moment-stamp ${stamp.on ? 'is-in' : ''}`}><Localized text={scene.extra?.saved ?? { pl: '', en: '' }} /></span>
        <span className={`film-moment-taglist ${tags.on ? 'is-in' : ''}`}>
          {(scene.chips ?? []).map((chip, index) => <em key={index}><Localized text={chip} /></em>)}
        </span>
      </div>
      <CopyBlock scene={scene} frame={frame} accent={ORANGE} tight />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 8. Zaproszenie                                                      */
/* ------------------------------------------------------------------ */

function OutroScene({ frame, scene, tier, deviceScale }: SceneProps) {
  const L = useFilmText();
  const settle = readCue(frame, 'settle');
  const mark = readCue(frame, 'mark');
  const flare = readCue(frame, 'flare');
  const tagline = readCue(frame, 'tagline');
  const chips = readCue(frame, 'chips');
  const orbit = readCue(frame, 'orbit');
  const version = readCue(frame, 'version');
  const center = { x: 960, y: 340 };
  const orbitAngle = clamp01(orbit.p) * 430 - 90;
  const land = clamp01((frame.t - (scene.ms - 1500)) / 1400);
  const orbitPoint = (angle: number) => ({
    x: center.x + Math.cos(angle * Math.PI / 180) * 596,
    y: center.y + Math.sin(angle * Math.PI / 180) * 190,
  });
  const perch = { x: 1252, y: 440 };
  const at = orbitPoint(orbitAngle);
  const point = { x: mix(at.x, perch.x, land), y: mix(at.y, perch.y, land) };
  const echoes = orbit.p > 0 && orbit.p < 1 && tier === 'high'
    ? [0, 1, 2, 3].map(index => {
      const behind = orbitPoint(orbitAngle - (index + 1) * 13);
      return { x: mix(behind.x, perch.x, land), y: mix(behind.y, perch.y, land), a: .3 - index * .06 };
    })
    : [];

  return (
    <div className="film-scene is-outro">
      <Backdrop accent={ORANGE} grid intensity={.35} />
      <span className="film-outro-core" style={{ opacity: String(clamp01(settle.p * .8)), transform: `scale(${lerp(1.4, 1, settle.p).toFixed(2)})` }} aria-hidden="true" />
      <span className="film-outro-flare" style={{ opacity: String(flare.p > 0 && flare.p < 1 ? Math.sin(flare.p * Math.PI) * .9 : 0) }} aria-hidden="true" />
      <div className={`film-outro-mark ${mark.on ? 'is-in' : ''}`}><JoyPadLogo size={196} /></div>
      <h2 className="film-outro-word"><Words text={`${L(scene.extra?.mark)}.`} on={mark.on} step={90} /></h2>
      <p className={`film-outro-tag ${tagline.on ? 'is-in' : ''}`}><Localized text={scene.extra?.tagline ?? { pl: '', en: '' }} /></p>
      <Chips items={scene.chips ?? []} on={chips.on} accent={ORANGE} />
      <span className={`film-outro-version ${version.on ? 'is-in' : ''}`}><Localized text={scene.extra?.version ?? { pl: '', en: '' }} /></span>
      {tier !== 'static' && orbit.p > 0 && (
        <CinemaPlamek
          x={point.x}
          y={point.y}
          r={42}
          sx={1 + (1 - land) * .16}
          sy={1 - (1 - land) * .12}
          tail={land > .6 ? 0 : 18}
          angle={orbitAngle + 90}
          wob={.5}
          spin={frame.t / 800}
          mood={land > .8 ? 'proud' : 'happy'}
          blink={land > .8 && Math.sin(frame.t / 300) > .9 ? 1 : 0}
          gaze={{ x: 0, y: .4 }}
          trail={echoes}
          paint={ORANGE}
          weight={.5}
          deviceScale={deviceScale}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export const SCENE_VIEWS: Record<ViewId, (props: SceneProps) => ReactElement> = {
  coldOpen: ColdOpenScene,
  library: LibraryScene,
  pair: PairScene,
  handoff: HandoffScene,
  play: PlayScene,
  split: SplitScene,
  moments: MomentsScene,
  outro: OutroScene,
};

export { STAGE, ORANGE as FILM_ACCENT, INK_DARK as FILM_INK };
