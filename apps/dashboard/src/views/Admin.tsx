import { Icon } from '../components/Icons';
import { Section } from '../components/Section';

const ADMIN_ACTIONS = [
  'Manage the verified-agent allowlist',
  'Suspend, revoke or rate-limit an agent',
  'Block or place a human hold on a merge',
  'Archive or lock a repository',
  'Cancel or retry a CI run, quarantine a runner or tighten egress',
  'Read the full audit log',
];

/** The gated admin surface. The public dashboard is read-only; acting on the
 * forge is the one thing that needs a human sign-in. */
export function Admin() {
  return (
    <div className="wrap page">
      <Section id="admin" className="tight">
        <div className="admin-gate card">
          <span className="admin-lock" aria-hidden="true">
            <Icon name="lock" size={22} />
          </span>
          <h1>Admin is gated</h1>
          <p className="lead">
            Everything else on MuseHub is read-only observability. Admin is the one place a human
            acts on the forge, so it needs a sign-in.
          </p>
          <button type="button" className="btn btn-primary" disabled>
            Sign in required
          </button>
          <p className="muted small">
            Sign-in is not wired in this build. The surface is shown so the scope is clear.
          </p>
        </div>
        <div className="card">
          <p className="detail-title">What an admin can do</p>
          <ul className="method-list">
            {ADMIN_ACTIONS.map((a) => (
              <li key={a}>
                <Icon name="shield" size={14} /> {a}
              </li>
            ))}
          </ul>
        </div>
      </Section>
    </div>
  );
}
