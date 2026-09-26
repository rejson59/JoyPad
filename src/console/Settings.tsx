import { DeviceProfile } from './DeviceProfile';
import type { ReactNode } from 'react';
import { AudioLines, Check, Fingerprint, MoveHorizontal, ScanLine, SlidersHorizontal, Sparkles } from 'lucide-react';
import { setPreferences, useConsolePreferences } from './preferences';
import { systemSound } from './sound';

export function ChoiceGroup<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string; detail?: string }[]; onChange: (value: T) => void;
}) {
  return <div className="cine-choices" role="group" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
      <span>{option.label}</span>{option.detail && <small>{option.detail}</small>}
      <Check size={12} className="cine-choice-check" aria-hidden="true" />
    </button>)}
  </div>;
}
function SettingSection({ number, title, detail, icon, children }: { number: string; title: string; detail: string; icon: ReactNode; children: ReactNode }) {
  return <section className="cine-setting-section"><div className="cine-setting-heading"><span className="cine-setting-icon">{icon}</span><div><h3>{title}</h3><p>{detail}</p></div><span className="cine-index">{number}</span></div>{children}</section>;
}
export function ConsoleSettings({ controller = false }: { controller?: boolean }) {
  const prefs = useConsolePreferences();
  return <div className="os-settings cine-settings">
    <div className="cine-settings-intro"><span className="cine-orbit-icon" aria-hidden="true"><SlidersHorizontal size={24} /></span><div><span className="os-eyebrow">{controller ? 'PROFIL KONTROLERA' : 'TWÓJ SYSTEM'}</span><p>Małe detale.<br /><strong>Twoje doświadczenie.</strong></p></div></div>
    {!controller && <SettingSection number="01" title="Brzmienie systemu" detail="Subtelny dźwięk. Wyraźna odpowiedź." icon={<AudioLines size={19} />}>
      <button className="cine-sound-switch" type="button" role="switch" aria-checked={prefs.sound} aria-label="Dźwięki systemu" onClick={() => { setPreferences({ sound: !prefs.sound }); systemSound('confirm'); }}>
        <span className={`cine-waveform ${prefs.sound ? 'is-on' : ''}`} aria-hidden="true">{[12,24,16,34,42,26,16,30,20,10].map((height, i) => <i key={i} style={{ height }} />)}</span>
        <span>{prefs.sound ? 'Dźwięk włączony' : 'Cisza'}<small>Tylko na dużym ekranie</small></span><span className="cine-switch-track"><i /></span>
      </button>
    </SettingSection>}
    <SettingSection number={controller ? '01' : '02'} title="Ruch i przejścia" detail="Spokojne tempo, bez utraty responsywności." icon={<ScanLine size={19} />}>
      <ChoiceGroup label="Ruch interfejsu" value={prefs.motion} options={[{ value: 'system', label: 'Systemowy', detail: 'Zgodnie z urządzeniem' }, { value: 'reduced', label: 'Ograniczony', detail: 'Bez animacji przejść' }]} onChange={motion => setPreferences({ motion })} />
    </SettingSection>
    {!controller && <SettingSection number="03" title="Podglądy gier" detail="Nagrane boty, bez dźwięku i bez uruchamiania silnika w tle." icon={<Sparkles size={19} />}>
      <button type="button" className="cine-sound-switch" role="switch" aria-label="Automatyczne podglądy gier" aria-checked={prefs.previews} onClick={() => setPreferences({ previews: !prefs.previews })}><span>{prefs.previews ? 'Automatycznie na dużym ekranie' : 'Tylko po naciśnięciu odtwarzania'}<small>Telefon, oszczędzanie danych i ograniczony ruch: start ręczny.</small></span><span className="cine-switch-track"><i /></span></button>
    </SettingSection>}
    {controller && <>
      <DeviceProfile />
      <SettingSection number="02" title="Poczuj reakcję" detail="Długość i rytm impulsów, nie siła silnika." icon={<Fingerprint size={19} />}>
        <ChoiceGroup label="Haptyka" value={prefs.haptics} options={[{ value: 'off', label: 'Wyłączona' }, { value: 'subtle', label: 'Subtelna' }, { value: 'full', label: 'Wyraźna' }]} onChange={haptics => setPreferences({ haptics })} />
      </SettingSection>
      <SettingSection number="03" title="Dopasowany do dłoni" detail="Strona akcji w arcade. Czołgi mają osobny układ." icon={<MoveHorizontal size={19} />}>
        <ChoiceGroup label="Przycisk akcji" value={prefs.hand} options={[{ value: 'left', label: 'Po lewej' }, { value: 'right', label: 'Po prawej' }]} onChange={hand => setPreferences({ hand })} />
        <label className="cine-range"><span>Rozmiar sterowania<output>{Math.round(prefs.controlSize * 100)}<small>%</small></output></span><input aria-label="Rozmiar sterowania" type="range" min="0.8" max="1.2" step="0.05" value={prefs.controlSize} onChange={e => setPreferences({ controlSize: Number(e.target.value) })} /><span className="cine-range-limits"><small>Kompaktowy</small><small>Duży</small></span></label>
        <label className="cine-range"><span>Wysokość kciuków<output>{prefs.controlHeight}<small>px</small></output></span><input aria-label="Wysokość kciuków" type="range" min="0" max="64" step="4" value={prefs.controlHeight} onChange={e => setPreferences({ controlHeight: Number(e.target.value) })} /><span className="cine-range-limits"><small>Niżej</small><small>Wyżej</small></span></label>
      </SettingSection>
      <p className="os-note">Na iPhonie wibracje przeglądarki nie są dostępne. Światło i reakcje przycisków działają niezależnie od haptyki.</p>
    </>}
    <div className="cine-save-note"><Sparkles size={13} /><span>Zapisywane automatycznie na tym urządzeniu<small>Jeśli przeglądarka zezwala na lokalny zapis</small></span></div>
  </div>;
}
