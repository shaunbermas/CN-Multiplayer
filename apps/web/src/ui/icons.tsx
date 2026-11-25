// Small line icons for the menu and HUD (owner's UI designs, 25 Nov 2026). Inline SVG, currentColor, no assets.
import type { ReactNode } from 'react';

function Svg({ children, size = 20, fill = false }: { children: ReactNode; size?: number; fill?: boolean }) {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export const IconUser = (p: { size?: number }) => <Svg {...p} fill><circle cx="12" cy="7.5" r="4.5" /><path d="M3 22c0-5 4-8.5 9-8.5s9 3.5 9 8.5z" /></Svg>;
export const IconUsers = (p: { size?: number }) => (
  <Svg {...p} fill><circle cx="12" cy="8" r="3.6" /><circle cx="5" cy="9.5" r="2.6" /><circle cx="19" cy="9.5" r="2.6" />
    <path d="M5.5 21c0-4 2.9-7 6.5-7s6.5 3 6.5 7z" /><path d="M0.5 20c0-3 1.8-5.3 4.5-5.3 1 0 1.8.3 2.5.8-1.3 1.3-2.1 2.9-2.4 4.5z" /><path d="M23.5 20c0-3-1.8-5.3-4.5-5.3-1 0-1.8.3-2.5.8 1.3 1.3 2.1 2.9 2.4 4.5z" /></Svg>
);
export const IconCode = (p: { size?: number }) => <Svg {...p}><path d="M8 7l-5 5 5 5" /><path d="M16 7l5 5-5 5" /><path d="M14 4l-4 16" /></Svg>;
export const IconBook = (p: { size?: number }) => <Svg {...p}><path d="M2 5c3-1.3 6.5-1.3 10 1 3.5-2.3 7-2.3 10-1v14c-3-1.3-6.5-1.3-10 1-3.5-2.3-7-2.3-10-1z" /><path d="M12 6v14" /></Svg>;
export const IconGear = (p: { size?: number }) => (
  <Svg {...p} fill><path fillRule="evenodd" d="M10.3 1.5h3.4l.5 2.7c.8.3 1.5.7 2.2 1.2l2.6-.9 1.7 2.9-2.1 1.8c.1.9.1 1.7 0 2.6l2.1 1.8-1.7 2.9-2.6-.9c-.7.5-1.4.9-2.2 1.2l-.5 2.7h-3.4l-.5-2.7c-.8-.3-1.5-.7-2.2-1.2l-2.6.9-1.7-2.9 2.1-1.8c-.1-.9-.1-1.7 0-2.6L3.3 7.4 5 4.5l2.6.9c.7-.5 1.4-.9 2.2-1.2zM12 15.6a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2z" /></Svg>
);
export const IconArrowRight = (p: { size?: number }) => <Svg {...p}><path d="M3 12h17" /><path d="M14 5l7 7-7 7" /></Svg>;
export const IconRestart = (p: { size?: number }) => <Svg {...p}><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 3.5v5h-5" /></Svg>;
export const IconRestartCcw = (p: { size?: number }) => <Svg {...p}><path d="M4 12a8 8 0 1 0 2.6-5.9" /><path d="M4 3.5v5h5" /></Svg>;
export const IconPause = (p: { size?: number }) => <Svg {...p} fill><rect x="5" y="3.5" width="5" height="17" rx="1" /><rect x="14" y="3.5" width="5" height="17" rx="1" /></Svg>;
export const IconPlay = (p: { size?: number }) => <Svg {...p} fill><path d="M6 3.5l15 8.5-15 8.5z" /></Svg>;
export const IconHome = (p: { size?: number }) => <Svg {...p} fill><path d="M12 2.5l10.5 9.5h-3v9.5h-5v-6.5h-5v6.5h-5V12h-3z" /></Svg>;
export const IconBars = (p: { size?: number }) => <Svg {...p} fill><rect x="3" y="13" width="4.5" height="8" /><rect x="9.75" y="8" width="4.5" height="13" /><rect x="16.5" y="3" width="4.5" height="18" /></Svg>;
export const IconPin = (p: { size?: number }) => <Svg {...p} fill><path fillRule="evenodd" d="M12 1.5a7.5 7.5 0 0 1 7.5 7.5c0 5.4-7.5 13.5-7.5 13.5S4.5 14.4 4.5 9A7.5 7.5 0 0 1 12 1.5zm0 10.3a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z" /></Svg>;
export const IconMouse = (p: { size?: number }) => <Svg {...p}><rect x="5.5" y="2.5" width="13" height="19" rx="6.5" /><path d="M12 2.5v7" /><path d="M5.5 9.5h13" /></Svg>;
export const IconFlag = (p: { size?: number }) => (
  <Svg {...p} fill><path d="M3.5 2h1.6l3.3 20H6.8z" /><path fillRule="evenodd" d="M5.2 3.2c4-1.6 6.6 1.4 10.6.2 1.4-.4 2.8-.9 4.2-1.6l1.6 9.6c-1.4.7-2.8 1.2-4.2 1.6-4 1.2-6.6-1.8-10.6-.2zm2.7 1.1l.5 2.9 2.7-.4-.5-2.9zm5.4.4l.5 2.9 2.7-.6-.5-2.8zm-4.9 2.5l.5 2.9 2.7-.4-.5-2.9zm5.4.4l.5 2.9 2.8-.6-.5-2.9z" /></Svg>
);
export const IconCheck = (p: { size?: number }) => <Svg {...p}><path d="M3.5 12.5l5.5 5.5L20.5 6" /></Svg>;
export const IconX = (p: { size?: number }) => <Svg {...p}><path d="M5 5l14 14" /><path d="M19 5L5 19" /></Svg>;
/** Three diagonal claw marks (Stage 02 card). */
export const IconClaws = (p: { size?: number }) => <Svg {...p}><path d="M8 3L4 21" /><path d="M13 2l-4 20" /><path d="M18 3l-4 18" /><path d="M2.5 13.5l17-3" /></Svg>;
/** A gift box (Stage 03 card). */
export const IconGift = (p: { size?: number }) => <Svg {...p}><rect x="3" y="9" width="18" height="12" /><path d="M2 6h20v3H2z" /><path d="M12 6v15" /><path d="M12 6C10 2 6 2 6.5 4.5 7 6 12 6 12 6zM12 6c2-4 6-4 5.5-1.5C17 6 12 6 12 6z" /></Svg>;
