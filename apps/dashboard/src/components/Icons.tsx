import type { ReactElement } from 'react';

export type IconName =
  | 'chevron'
  | 'sun'
  | 'moon'
  | 'repo'
  | 'pr'
  | 'commit'
  | 'branch'
  | 'merge'
  | 'check'
  | 'x'
  | 'play'
  | 'pause'
  | 'external'
  | 'search'
  | 'shield'
  | 'lock'
  | 'clock'
  | 'dot'
  | 'agent'
  | 'arrow'
  | 'filter'
  | 'pin';

function shape(name: IconName): ReactElement {
  switch (name) {
    case 'chevron':
      return <path d="m6 9 6 6 6-6" />;
    case 'sun':
      return (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
        </>
      );
    case 'moon':
      return <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />;
    case 'repo':
      return (
        <>
          <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
        </>
      );
    case 'pr':
      return (
        <>
          <circle cx="6" cy="6" r="2.5" />
          <circle cx="6" cy="18" r="2.5" />
          <circle cx="18" cy="18" r="2.5" />
          <path d="M6 8.5v7M18 15.5V11a3 3 0 0 0-3-3h-3l2-2m-2 2 2 2" />
        </>
      );
    case 'commit':
      return (
        <>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 3v5.5M12 15.5V21" />
        </>
      );
    case 'branch':
      return (
        <>
          <circle cx="6" cy="6" r="2.5" />
          <circle cx="18" cy="6" r="2.5" />
          <circle cx="6" cy="18" r="2.5" />
          <path d="M6 8.5v7M18 8.5c0 4-6 3-6 7" />
        </>
      );
    case 'merge':
      return (
        <>
          <circle cx="6" cy="6" r="2.5" />
          <circle cx="6" cy="18" r="2.5" />
          <circle cx="18" cy="12" r="2.5" />
          <path d="M6 8.5v7M6 12h4a5 5 0 0 0 5.5-2" />
        </>
      );
    case 'check':
      return <path d="m5 12.5 4.5 4.5L19 7" />;
    case 'x':
      return <path d="M6 6l12 12M18 6 6 18" />;
    case 'play':
      return <path d="M8 5.5v13l10-6.5z" />;
    case 'pause':
      return <path d="M9 5v14M15 5v14" />;
    case 'external':
      return (
        <path d="M14 4h6v6M20 4l-9 9M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
      );
    case 'search':
      return (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </>
      );
    case 'shield':
      return <path d="M12 3l7 3v5c0 4.2-3 7.6-7 9-4-1.4-7-4.8-7-9V6z" />;
    case 'lock':
      return (
        <>
          <rect x="5" y="11" width="14" height="9" rx="1.5" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </>
      );
    case 'clock':
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </>
      );
    case 'dot':
      return <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />;
    case 'agent':
      return (
        <>
          <rect x="6" y="6" width="12" height="12" rx="2" />
          <rect x="10" y="10" width="4" height="4" rx="0.5" />
          <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
        </>
      );
    case 'arrow':
      return <path d="M5 12h13M13 6l6 6-6 6" />;
    case 'filter':
      return <path d="M4 5h16l-6 7v6l-4 2v-8z" />;
    case 'pin':
      return <path d="M12 3l3 5 5 1-4 4 1 6-5-3-5 3 1-6-4-4 5-1z" />;
  }
}

export function Icon({
  name,
  size = 16,
  title,
  className,
}: {
  name: IconName;
  size?: number;
  title?: string;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {shape(name)}
    </svg>
  );
}
