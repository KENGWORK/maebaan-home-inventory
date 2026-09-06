// Inline SVGs ported from design/Home Inventory.dc.html (attributes camel-cased for JSX).

export const BackChevron = () => (
  <svg width="8" height="14" viewBox="0 0 8 14">
    <path d="M6.5 1 L1.5 7 L6.5 13" fill="none" stroke="#6A57D6" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

export const GearIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6A57D6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z" />
  </svg>
);

export const ChevronRight = ({ color = "#B6ACD4" }: { color?: string }) => (
  <svg width="9" height="15" viewBox="0 0 9 15">
    <path d={`M1.5 1.5 L7 7.5 L1.5 13.5`} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

export const MicIcon = () => (
  <svg width="15" height="20" viewBox="0 0 15 20">
    <rect x="4.5" y="1" width="6" height="10" rx="3" fill="#6A57D6" />
    <path d="M2 9.5a5.5 5.5 0 0 0 11 0" fill="none" stroke="#6A57D6" strokeWidth="2" strokeLinecap="round" />
    <rect x="6.6" y="15" width="1.8" height="4" rx=".9" fill="#6A57D6" />
  </svg>
);

export const SearchIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16">
    <circle cx="6.8" cy="6.8" r="5" fill="none" stroke="#8B82A6" strokeWidth="2" />
    <path d="M10.6 10.6 L14.5 14.5" stroke="#8B82A6" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const CloseIcon = ({ color = "#ffffff", w = 15 }: { color?: string; w?: number }) => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round">
    <path d="M6 6 L18 18 M18 6 L6 18" />
  </svg>
);

export const NavHomeIcon = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
    <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

export const NavInvIcon = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 15h4" />
    <path d="m14.817 10.995-.971-1.45 1.034-1.232a2 2 0 0 0-2.025-3.238l-1.82.364L9.91 3.885a2 2 0 0 0-3.625.748L6.141 6.55l-1.725.426a2 2 0 0 0-.19 3.756l.657.27" />
    <path d="m18.822 10.995 2.26-5.38a1 1 0 0 0-.557-1.318L16.954 2.9a1 1 0 0 0-1.281.533l-.924 2.122" />
    <path d="M4 12.006A1 1 0 0 1 4.994 11H19a1 1 0 0 1 1 1v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
  </svg>
);

export const NavCamIcon = () => (
  <svg width="26" height="22" viewBox="0 0 27 23">
    <rect x="1.5" y="4.5" width="24" height="17" rx="5" fill="none" stroke="#ffffff" strokeWidth="2.2" />
    <circle cx="13.5" cy="13" r="4.6" fill="none" stroke="#ffffff" strokeWidth="2.2" />
    <path d="M9 4.5 L10.8 1.5 L16.2 1.5 L18 4.5" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinejoin="round" />
  </svg>
);

export const NavShopIcon = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18" />
    <path d="M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25" />
    <circle cx="18" cy="20" r="2" />
    <circle cx="8" cy="20" r="2" />
  </svg>
);

export const NavHistIcon = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
    <path d="M14 2v5a1 1 0 0 0 1 1h5" />
    <path d="m9 15 2 2 4-4" />
  </svg>
);

export const TrashIcon = ({ color = "#C9524F", w = 12 }: { color?: string; w?: number }) => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round">
    <path d="M6 6 L18 18 M18 6 L6 18" />
  </svg>
);
