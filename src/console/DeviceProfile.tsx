import { Apple, Smartphone, MonitorSmartphone, ArrowRight } from 'lucide-react';
import { setPreferences, useConsolePreferences } from './preferences';
export function DeviceProfile({ welcome = false }: { welcome?: boolean }) {
  const prefs = useConsolePreferences();
  const choices = [{ value: 'android', name: 'Android', icon: Smartphone, detail: 'Sterowanie dotykiem, haptyka jeśli dostępna' }, { value: 'ios', name: 'iPhone / iPad', icon: Apple, detail: 'Stała gałka, bez przesuwania jej pod palcem' }, { value: 'auto', name: 'Automatycznie', icon: MonitorSmartphone, detail: 'Profil dopasowany do przeglądarki' }] as const;
  return <section className={welcome ? 'os-device-welcome' : 'os-device-profile'} aria-label="Profil telefonu">
    {welcome && <><span className="os-wordmark">JoyPad<span>.</span></span><h1>Twój telefon.<br />Twój pad.</h1><p>Wybierz urządzenie. Profil możesz później zmienić w ustawieniach.</p></>}
    <div className="os-device-choices">{choices.map(({ value, name, icon: Icon, detail }) => <button key={value} aria-pressed={prefs.deviceChosen && prefs.deviceProfile === value} onClick={() => setPreferences({ deviceProfile: value, deviceChosen: true })}><Icon size={25} aria-hidden="true" /><span><b>{name}</b><small>{detail}</small></span>{welcome && <ArrowRight size={18} />}</button>)}</div>
    <p className="os-note">Profil nie zmienia możliwości systemu. Wibracje i pełny ekran działają tylko tam, gdzie przeglądarka je udostępnia. Na iPhonie reakcje wizualne zastępują wibracje.</p>
  </section>;
}
export function usesStableStick(profile: 'auto' | 'android' | 'ios') {
  if (profile !== 'auto') return profile === 'ios';
  return typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
}
