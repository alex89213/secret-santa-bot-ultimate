/**
 * Description:  Flat holiday artwork (tree, Santa hat, holly, ornament, candy cane) drawn on a
 *               48x48 grid with at most three palette colors each. Colors come from globals.css.
 * Author:       Alex Wu
 * Dependencies:
 * Usage:
 */
type Art = { className?: string };
const svg = (className?: string) => ({
  className,
  viewBox: '0 0 48 48',
  'aria-hidden': true as const,
  focusable: 'false' as const,
});
const ALMOND = 'M0 0Q11 -8 22 0Q11 8 0 0Z';
export function TreeArt({ className }: Art) {
  return (
    <svg {...svg(className)}>
      <path
        className="fill-gold"
        d="M24 2L25.29 5.22L28.76 5.45L26.09 7.68L26.94 11.05L24 9.2L21.06 11.05L21.91 7.68L19.24 5.45L22.71 5.22Z"
      />
      <path className="soft-pine" d="M24 11L33 21H15Z" />
      <path className="soft-pine" d="M24 17L37 30H11Z" />
      <path className="soft-pine" d="M24 24L41 39H7Z" />
      <rect className="fill-trunk" x="21" y="39" width="6" height="6" rx="1.5" />
    </svg>
  );
}
function HatArt({ className }: Art) {
  return (
    <svg {...svg(className)}>
      <path
        className="fill-berry"
        d="M8 36C10 20 18 9 30 10C37 11 40 17 39 24L34 21C32 26 32 31 33 36Z"
      />
      <rect className="fill-cream" x="5" y="33" width="32" height="9" rx="4.5" />
      <circle className="fill-cream" cx="39" cy="24" r="4.5" />
    </svg>
  );
}
function HollyArt({ className }: Art) {
  return (
    <svg {...svg(className)}>
      <path className="fill-pine" d={ALMOND} transform="translate(24 27) rotate(-150)" />
      <path className="fill-pine" d={ALMOND} transform="translate(24 27) rotate(-30)" />
      <circle className="fill-berry" cx="19.5" cy="29" r="5" />
      <circle className="fill-berry" cx="28.5" cy="29" r="5" />
      <circle className="fill-berry" cx="24" cy="36.5" r="5" />
    </svg>
  );
}
function OrnamentArt({ className }: Art) {
  return (
    <svg {...svg(className)}>
      <circle className="line-gold" cx="24" cy="7" r="3.5" />
      <rect className="fill-gold" x="18" y="10" width="12" height="7" rx="2" />
      <circle className="fill-berry" cx="24" cy="30" r="15" />
    </svg>
  );
}
function CaneArt({ className }: Art) {
  return (
    <svg {...svg(className)}>
      <path className="cane-base" d="M30 44V16a8 8 0 0 0-16 0v3" />
      <path className="cane-stripe" d="M30 44V16a8 8 0 0 0-16 0v3" />
    </svg>
  );
}
/** Draws the four corner illustrations used on standalone pages such as sign-in. */
export function CornerArt() {
  return (
    <>
      <HollyArt className="deco holly" />
      <HatArt className="deco hat" />
      <CaneArt className="deco cane" />
      <OrnamentArt className="deco ornament" />
    </>
  );
}
