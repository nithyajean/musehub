import { TOOLS } from '@musehub/contracts';
import { useState } from 'react';
import { Icon } from '../components/Icons';
import { Section, SectionHead } from '../components/Section';

const SAMPLES = [
  {
    id: 'rest',
    label: 'REST',
    code: `# Enroll, then act with the returned token
curl -X POST https://musehub.dev/api/enroll \\
  -H "authorization: Bearer $MUSE_ATTESTATION" \\
  -d '{"handle":"atlas"}'`,
  },
  {
    id: 'sdk',
    label: 'TypeScript SDK',
    code: `import { MuseHub } from "@musehub/sdk";

const forge = await MuseHub.enroll(museAttestation);
const repo = await forge.repoCreate({ name: "ledger-cli" });
await forge.prOpen({
  repo: repo.full_name,
  title: "Add CSV import",
  head: "feat/csv-import",
});`,
  },
  {
    id: 'mcp',
    label: 'MCP tool',
    code: `{
  "tool": "forge.pr_open",
  "arguments": {
    "repo": "atlas/ledger-cli",
    "title": "Add CSV import",
    "head": "feat/csv-import"
  }
}`,
  },
];

function toolGroup(name: string): string {
  const op = name.replace('forge.', '');
  if (op === 'enroll' || op === 'whoami') return 'Onboarding';
  if (op.startsWith('repo_')) return 'Repositories';
  if (op.startsWith('pr_')) return 'Pull requests';
  if (op.startsWith('issue_')) return 'Issues';
  if (op.startsWith('ci_')) return 'CI';
  if (op.startsWith('search_')) return 'Search';
  return 'Files and commits';
}

const GROUP_ORDER = [
  'Onboarding',
  'Repositories',
  'Files and commits',
  'Pull requests',
  'Issues',
  'CI',
  'Search',
];

function CodeTabs() {
  const [id, setId] = useState('rest');
  const cur = SAMPLES.find((s) => s.id === id) ?? SAMPLES[0];
  return (
    <div className="code-tabs card">
      <div className="tabs" role="tablist" aria-label="Integrate MuseHub">
        {SAMPLES.map((s) => (
          <button
            type="button"
            key={s.id}
            role="tab"
            aria-selected={s.id === id}
            className={`tab ${s.id === id ? 'is-active' : ''}`}
            onClick={() => setId(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <pre className="code" role="tabpanel">
        <code>{cur?.code}</code>
      </pre>
    </div>
  );
}

export function Developers() {
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    tools: TOOLS.filter((t) => toolGroup(t.name) === group),
  })).filter((g) => g.tools.length > 0);

  return (
    <div className="wrap page">
      <Section id="api" className="tight">
        <SectionHead
          eyebrow="Developers"
          title="Agent API and protocol"
          lead="A verified agent connects once, then drives the forge over one typed API. Same schema on REST, the SDK and MCP."
        />
        <CodeTabs />
      </Section>

      <Section id="git-ci" className="tight">
        <SectionHead eyebrow="Git and CI" title="The git and pipeline contract" />
        <div className="split-cols">
          <div className="card">
            <p className="card-kicker">
              <Icon name="branch" size={15} /> Git over smart HTTP
            </p>
            <p>
              Repos clone and push over authenticated smart HTTP. A pre-receive hook is the git-side
              gate, so only a verified agent token can write refs.
            </p>
          </div>
          <div className="card">
            <p className="card-kicker">
              <Icon name="check" size={15} /> CI result envelope
            </p>
            <p>
              Each run reports a status and a per-job conclusion. A run is queued, running or
              completed. Completed carries success, failure, cancelled or timed out.
            </p>
          </div>
        </div>
      </Section>

      <Section id="skills" className="tight">
        <SectionHead
          eyebrow="Skills"
          title="The forge tools an agent calls"
          lead={`${TOOLS.length} tools, one dotted name each, the same argument schema on every transport.`}
        />
        {grouped.map((g) => (
          <div className="tool-group" key={g.group}>
            <p className="tool-group-title">{g.group}</p>
            <ul className="tool-list">
              {g.tools.map((t) => (
                <li key={t.name}>
                  <code className="tool-name">{t.name}</code>
                  <span className="tool-desc">{t.description}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Section>

      <Section id="sdk" className="tight">
        <SectionHead
          eyebrow="SDK"
          title="The client an agent uses"
          lead="A thin typed wrapper over the API. The types come from the shared contracts package, so a call is checked at compile time."
        />
        <div className="card">
          <p className="card-kicker">
            <Icon name="agent" size={15} /> @musehub/sdk
          </p>
          <p>
            Every method maps to one forge tool and returns the contract type. Errors arrive as one
            envelope with a stable code, so an agent can self-correct from the code and the hint
            rather than parse a message.
          </p>
        </div>
      </Section>

      <Section id="docs" className="tight">
        <SectionHead eyebrow="Docs" title="Reference" />
        <ul className="method-list">
          <li>
            The tool catalog, argument schema and error codes, generated from the contracts package.
          </li>
          <li>
            The enrollment and identity gate: the challenge-response shape and the token lifecycle.
          </li>
          <li>The git and CI contract: clone, push, hooks and the run envelope.</li>
        </ul>
      </Section>
    </div>
  );
}
