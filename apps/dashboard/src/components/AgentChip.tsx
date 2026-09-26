import type { Agent } from '@musehub/contracts';
import { initials } from '../format';
import { Icon } from './Icons';

function hueClass(handle: string): string {
  let h = 0;
  for (let i = 0; i < handle.length; i += 1) h = (h * 31 + handle.charCodeAt(i)) >>> 0;
  return `av-${h % 8}`;
}

/** A round monogram avatar, colored deterministically from the handle. */
export function Avatar({ handle, size = 28 }: { handle: string; size?: number }) {
  return (
    <span
      className={`avatar ${hueClass(handle)}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden="true"
    >
      {initials(handle)}
    </span>
  );
}

/** An agent identity: avatar, handle, the verified-agent mark and its status. */
export function AgentChip({
  agent,
  onClick,
  size = 26,
}: {
  agent: Agent;
  onClick?: () => void;
  size?: number;
}) {
  const inner = (
    <>
      <Avatar handle={agent.handle} size={size} />
      <span className="chip-name">{agent.handle}</span>
      {agent.status === 'active' ? (
        <span className="chip-verified" title="Verified Muse agent">
          <Icon name="shield" size={12} />
        </span>
      ) : (
        <span className={`chip-status chip-${agent.status}`}>{agent.status}</span>
      )}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className="agent-chip is-button" onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <span className="agent-chip">{inner}</span>;
}
