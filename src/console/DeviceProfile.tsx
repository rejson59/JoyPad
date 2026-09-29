import { Apple, Smartphone, MonitorSmartphone, ArrowRight } from 'lucide-react';
import { setPreferences, useConsolePreferences } from './preferences';
import { useT } from '../platform/i18n';
export function DeviceProfile({ welcome = false }: { welcome?: boolean }) {
  const prefs = useConsolePreferences();
  const { language } = useT();
  const en = language === 'en';
  const choices = [
    { value: 'android', name: 'Android', icon: Smartphone, detail: en ? 'Touch controls, with haptics if available' : 'Sterowanie dotykiem, haptyka jeśli dostępna' },
    { value: 'ios', name: 'iPhone / iPad', icon: Apple, detail: en ? 'Fixed stick, no movement under your thumb' : 'Stała gałka, bez przesuwania jej pod palcem' },
    { value: 'auto', name: en ? 'Automatic' : 'Automatycznie', icon: MonitorSmartphone, detail: en ? 'Profile matched to your browser' : 'Profil dopasowany do przeglądarki' },
  ] as const;
  return <section className={welcome ? 'os-device-welcome' : 'os-device-profile'} aria-label={en ? 'Phone profile' : 'Profil telefonu'}>
    {welcome && <><span className="os-wordmark">JoyPad<span>.</span></span><h1>{en ? <>Your phone.<br />Your controller.</> : <>Twój telefon.<br />Twój pad.</>}</h1><p>{en ? 'Choose your device. You can change this profile later in settings.' : 'Wybierz urządzenie. Profil możesz później zmienić w ustawieniach.'}</p></>}
    <div className="os-device-choices">{choices.map(({ value, name, icon: Icon, detail }) => <button key={value} aria-pressed={prefs.deviceChosen && prefs.deviceProfile === value} onClick={() => setPreferences({ deviceProfile: value, deviceChosen: true })}><Icon size={25} aria-hidden="true" /><span><b>{name}</b><small>{detail}</small></span>{welcome && <ArrowRight size={18} />}</button>)}</div>
    <p className="os-note">{en ? 'This profile does not change system capabilities. Haptics and fullscreen depend on browser support. iPhone browsers use visual feedback instead of vibration.' : 'Profil nie zmienia możliwości systemu. Wibracje i pełny ekran działają tylko tam, gdzie przeglądarka je udostępnia. Na iPhonie reakcje wizualne zastępują wibracje.'}</p>
  </section>;
}
export function usesStableStick(profile: 'auto' | 'android' | 'ios') {
  if (profile !== 'auto') return profile === 'ios';
  return typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
}
