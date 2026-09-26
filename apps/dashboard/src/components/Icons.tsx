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
  | 'pin'
  | 'copy'
  | 'terminal'
  | 'command'
  | 'bolt'
  | 'globe'
  | 'cpu'
  | 'key'
  | 'wallet'
  | 'chart'
  | 'layers'
  | 'box'
  | 'spinner';

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
      return <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />;
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
    case 'copy':
      return (
        <>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V6a2 2 0 0 1 2-2h9" />
        </>
      );
    case 'terminal':
      return (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="m7 9 3 3-3 3M12 15h5" />
        </>
      );
    case 'command':
      return (
        <path d="M9 9V6a3 3 0 1 0-3 3h3zm0 0h6m-6 0v6m6-6V6a3 3 0 1 1 3 3h-3zm0 6v3a3 3 0 1 0 3-3h-3zm0 0H9m0 0v3a3 3 0 1 1-3-3h3z" />
      );
    case 'bolt':
      return <path d="M13 2 4 14h7l-1 8 9-12h-7z" />;
    case 'globe':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </>
      );
    case 'cpu':
      return (
        <>
          <rect x="6" y="6" width="12" height="12" rx="2" />
          <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
          <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
        </>
      );
    case 'key':
      return (
        <>
          <circle cx="8" cy="14" r="4" />
          <path d="M11 11 20 2M16 6l3 3M14 8l2 2" />
        </>
      );
    case 'wallet':
      return (
        <>
          <path d="M3 7a2 2 0 0 1 2-2h13v3H5a2 2 0 0 1-2-2z" />
          <path d="M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H5" />
          <circle cx="16.5" cy="14.5" r="1" fill="currentColor" stroke="none" />
        </>
      );
    case 'chart':
      return <path d="M4 20h16M6 16l4-5 4 3 5-7" />;
    case 'layers':
      return <path d="m12 3 9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5" />;
    case 'box':
      return (
        <>
          <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3z" />
          <path d="M4 7.5 12 12l8-4.5M12 12v9" />
        </>
      );
    case 'spinner':
      return <path d="M12 3a9 9 0 1 1-6.4 2.6" />;
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
