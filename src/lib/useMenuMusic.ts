import { useEffect, useState } from 'react';
import { menuMusic } from '../game/menuMusic';

/** Stan przełącznika muzyki menu zsynchronizowany z singletonem menuMusic. */
export function useMenuMusic(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(menuMusic.enabled);
  useEffect(() => menuMusic.subscribe(setEnabled), []);
  return [enabled, (on: boolean) => menuMusic.setEnabled(on)];
}
