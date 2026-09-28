import { DeviceProfile } from './DeviceProfile';
import type { ReactNode } from 'react';
import { AudioLines, Check, Fingerprint, MoveHorizontal, ScanLine, SlidersHorizontal, Sparkles } from 'lucide-react';
import { setPreferences, useConsolePreferences } from './preferences';
import { systemSound } from './sound';
import { LANGUAGES, setLanguage } from '../platform/i18n';
import { useT } from '../platform/i18n';

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
  const { language, t } = useT();
  const en = language === 'en';
  return <div className="os-settings cine-settings">
    <div className="cine-settings-intro"><span className="cine-orbit-icon" aria-hidden="true"><SlidersHorizontal size={24} /></span><div><span className="os-eyebrow">{controller ? t('settings.controllerProfile') : t('settings.system')}</span><p>{en ? <>Small details.<br /><strong>Your experience.</strong></> : <>Małe detale.<br /><strong>Twoje doświadczenie.</strong></>}</p></div></div>
    <SettingSection number="01" title={t('common.language')} detail={t('common.languageDetail')} icon={<Sparkles size={19} />}><div className="language-picker">{Object.entries(LANGUAGES).map(([id, label]) => <button type="button" key={id} aria-pressed={language === id} onClick={() => setLanguage(id as 'pl' | 'en')}>{label}</button>)}</div></SettingSection>
    {!controller && <SettingSection number="02" title={t('settings.sound')} detail={t('settings.soundDetail')} icon={<AudioLines size={19} />}>
      <button className="cine-sound-switch" type="button" role="switch" aria-checked={prefs.sound} aria-label={t('settings.soundAria')} onClick={() => { setPreferences({ sound: !prefs.sound }); systemSound('confirm'); }}>
        <span className={`cine-waveform ${prefs.sound ? 'is-on' : ''}`} aria-hidden="true">{[12,24,16,34,42,26,16,30,20,10].map((height, i) => <i key={i} style={{ height }} />)}</span>
        <span>{prefs.sound ? t('settings.soundOn') : t('settings.silence')}<small>{t('settings.bigScreenOnly')}</small></span><span className="cine-switch-track"><i /></span>
      </button>
    </SettingSection>}
    {!controller && <SettingSection number="03" title={t('settings.motion')} detail={t('settings.motionDetail')} icon={<ScanLine size={19} />}>
      <ChoiceGroup label={t('settings.motionAria')} value={prefs.motion} options={[{ value: 'system', label: t('settings.motionSystem'), detail: t('settings.motionDevice') }, { value: 'reduced', label: t('settings.motionReduced'), detail: t('settings.noTransitions') }]} onChange={motion => setPreferences({ motion })} />
    </SettingSection>}
    {!controller && <SettingSection number="04" title={t('settings.previews')} detail={t('settings.previewDetail')} icon={<Sparkles size={19} />}>
      <button type="button" className="cine-sound-switch" role="switch" aria-label={t('settings.previews')} aria-checked={prefs.previews} onClick={() => setPreferences({ previews: !prefs.previews })}><span>{prefs.previews ? t('settings.previewAuto') : t('settings.previewManual')}<small>{t('settings.previewRules')}</small></span><span className="cine-switch-track"><i /></span></button>
    </SettingSection>}
    {!controller && <SettingSection number="05" title={t('settings.moments')} detail={t('settings.momentsDetail')} icon={<Sparkles size={19} />}>
      <button className="cine-sound-switch" type="button" role="switch" aria-label={t('settings.moments')} aria-checked={prefs.replays} onClick={() => setPreferences({ replays: !prefs.replays })}><span>{prefs.replays ? t('settings.recordOn') : t('settings.recordOff')}<small>{t('settings.recordRules')}</small></span><span className="cine-switch-track"><i /></span></button>
    </SettingSection>}
    {controller && <>
      <DeviceProfile />
      <SettingSection number="02" title={t('settings.feel')} detail={t('settings.hapticsDetail')} icon={<Fingerprint size={19} />}>
        <ChoiceGroup label={t('settings.haptics')} value={prefs.haptics} options={[{ value: 'off', label: t('settings.hapticsOff') }, { value: 'subtle', label: t('settings.subtle') }, { value: 'full', label: t('settings.full') }]} onChange={haptics => setPreferences({ haptics })} />
      </SettingSection>
      <SettingSection number="03" title={t('settings.hand')} detail={t('settings.handDetail')} icon={<MoveHorizontal size={19} />}>
        <ChoiceGroup label={t('settings.actionButton')} value={prefs.hand} options={[{ value: 'left', label: t('settings.left') }, { value: 'right', label: t('settings.right') }]} onChange={hand => setPreferences({ hand })} />
        <label className="cine-range"><span>{t('settings.controlSize')}<output>{Math.round(prefs.controlSize * 100)}<small>%</small></output></span><input aria-label={t('settings.controlSize')} type="range" min="0.8" max="1.2" step="0.05" value={prefs.controlSize} onChange={e => setPreferences({ controlSize: Number(e.target.value) })} /><span className="cine-range-limits"><small>{t('settings.compact')}</small><small>{t('settings.large')}</small></span></label>
        <label className="cine-range"><span>{t('settings.height')}<output>{prefs.controlHeight}<small>px</small></output></span><input aria-label={t('settings.height')} type="range" min="0" max="64" step="4" value={prefs.controlHeight} onChange={e => setPreferences({ controlHeight: Number(e.target.value) })} /><span className="cine-range-limits"><small>{t('settings.lower')}</small><small>{t('settings.higher')}</small></span></label>
      </SettingSection>
      <p className="os-note">{en ? 'Vibration is not available in iPhone browsers. The lightbar and button feedback work independently.' : 'Na iPhonie wibracje przeglądarki nie są dostępne. Światło i reakcje przycisków działają niezależnie od haptyki.'}</p>
    </>}
    <div className="cine-save-note"><Sparkles size={13} /><span>{t('settings.saveAuto')}<small>{t('settings.saveLocal')}</small></span></div>
  </div>;
}
