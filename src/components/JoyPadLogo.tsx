/** Small-size vector adaptation of the selected JoyPad smile mark. */
export function JoyPadLogo({ size = 42, className = '' }: { size?: number; className?: string }) {
  return <img className={`joypad-mark ${className}`} src={`${import.meta.env.BASE_URL}brand/joypad-mark.svg`} width={size} height={size * .7} alt="" aria-hidden="true" />;
}
