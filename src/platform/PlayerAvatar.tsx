import { Bot, Cat, Ghost, Rocket, Smile, Sparkles } from 'lucide-react';
import type { PlayerProfile } from './profile';
const icons = { smile: Smile, spark: Sparkles, ghost: Ghost, cat: Cat, rocket: Rocket, alien: Bot };
/** Vector glyphs, not OS emoji: identical and legible on TVs without emoji fonts. */
export function PlayerAvatar({ avatar, size = 24 }: { avatar: PlayerProfile['avatar']; size?: number }) {
  const Icon = icons[avatar];
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />;
}
