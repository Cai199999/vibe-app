import type { ReactNode, SVGProps } from 'react'

export type IconName =
  | 'sparkles'
  | 'undo'
  | 'send'
  | 'plus'
  | 'minus'
  | 'fit'
  | 'close'
  | 'trash'
  | 'copy'
  | 'check'
  | 'alert'
  | 'cursor'
  | 'hand'
  | 'note'
  | 'draw'
  | 'drag'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronRight'
  | 'refresh'
  | 'code'
  | 'file'
  | 'image'
  | 'home'
  | 'lock'
  | 'link'

const CONTENT: Record<IconName, ReactNode> = {
  sparkles: (
    <>
      <path d="M12 3l1.8 4.9L19 9.7l-4.2 3.1L16 18l-4-2.6L8 18l1.2-5.2L5 9.7l5.2-1.8L12 3z" />
      <path d="M19 3v3M20.5 4.5h-3" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14l-4-4 4-4" />
      <path d="M5 10h7a4 4 0 010 8h-1" />
    </>
  ),
  send: (
    <>
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M4 20h16" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  fit: (
    <>
      <path d="M8 3H5a2 2 0 00-2 2v3" />
      <path d="M16 3h3a2 2 0 012 2v3" />
      <path d="M8 21H5a2 2 0 01-2-2v-3" />
      <path d="M16 21h3a2 2 0 002-2v-3" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 012-2h10" />
    </>
  ),
  check: <path d="M20 6L9 17l-5-5" />,
  alert: (
    <>
      <path d="M10.3 3.9L2.5 18a2 2 0 001.7 3h15.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  cursor: (
    <>
      <path d="M5 3l14 9-7 1-3 6-4-16z" />
    </>
  ),
  hand: (
    <>
      <path d="M8 13V5a2 2 0 014 0v6" />
      <path d="M12 11V4a2 2 0 014 0v8" />
      <path d="M16 12V7a2 2 0 014 0v9a7 7 0 01-7 7h-1a7 7 0 01-7-7v-3a2 2 0 014 0" />
    </>
  ),
  note: (
    <>
      <path d="M21 15a4 4 0 01-4 4H8l-5 3V6a3 3 0 013-3h11a4 4 0 014 4v8z" />
      <path d="M8 9h8M8 13h5" />
    </>
  ),
  draw: (
    <>
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <path d="M2 2l7.6 7.6" />
    </>
  ),
  drag: (
    <>
      <path d="M12 2v20M2 12h20" />
      <path d="M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4" />
    </>
  ),
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronLeft: <path d="M15 18l-6-6 6-6" />,
  chevronRight: <path d="M9 18l6-6-6-6" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 10-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </>
  ),
  code: (
    <>
      <path d="M16 18l6-6-6-6" />
      <path d="M8 6l-6 6 6 6" />
    </>
  ),
  file: (
    <>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 15l-5-5L5 20" />
    </>
  ),
  home: (
    <>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 018 0v3" />
    </>
  ),
  link: (
    <>
      <path d="M10 13.5a4.5 4.5 0 006.4.4l2-2a4.5 4.5 0 00-6.4-6.4l-1.1 1.1" />
      <path d="M14 10.5a4.5 4.5 0 00-6.4-.4l-2 2a4.5 4.5 0 006.4 6.4l1.1-1.1" />
    </>
  ),
}

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 14, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {CONTENT[name]}
    </svg>
  )
}
