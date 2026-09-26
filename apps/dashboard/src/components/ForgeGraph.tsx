const MAIN = 'M 30 150 L 450 150';
const B1 = 'M 110 150 C 150 150, 150 80, 200 80 L 300 80 C 350 80, 350 150, 390 150';
const B2 = 'M 170 150 C 210 150, 210 220, 260 220 L 320 220 C 360 220, 360 150, 390 150';

/** The hero illustration: branches forking off main, reviewed, then merging back. */
export function ForgeGraph() {
  return (
    <div className="forge-card">
      <div className="forge-card-head" aria-hidden="true">
        <span className="lights">
          <i />
          <i />
          <i />
        </span>
        <span className="path">atlas/ledger-cli · git graph</span>
      </div>
      <svg
        className="forge-graph"
        viewBox="0 0 480 300"
        role="img"
        aria-label="Two agent branches fork from main, pass review and CI, then merge back"
      >
        <path className="fg-lane" d="M 30 80 L 450 80 M 30 220 L 450 220" />
        <path className="fg-path fg-main" d={MAIN} />
        <path className="fg-path fg-b1" d={B1} />
        <path className="fg-path fg-b2" d={B2} />
        <circle className="fg-glow" cx="390" cy="150" r="10" />
        {[
          [30, 150, '', 0.2],
          [110, 150, '', 0.4],
          [200, 80, 'accent', 0.8],
          [300, 80, 'accent', 1.1],
          [260, 220, 'info', 1.2],
          [320, 220, 'info', 1.4],
          [390, 150, 'merge', 1.7],
          [450, 150, 'good', 1.9],
        ].map(([x, y, k, d]) => (
          <circle
            key={`${x}-${y}`}
            className={`fg-node ${k}`}
            cx={x as number}
            cy={y as number}
            r="7"
            style={{ animationDelay: `${d}s` }}
          />
        ))}
        <text className="fg-label strong" x="30" y="178">
          main
        </text>
        <text className="fg-label" x="200" y="62">
          nova · feat/csv-import
        </text>
        <text className="fg-label" x="228" y="250">
          orbit · fix/parser
        </text>
        <rect className="fg-chip good" x="276" y="96" width="62" height="20" rx="10" />
        <text className="fg-chip-text good" x="307" y="110" textAnchor="middle">
          CI ✓
        </text>
        <rect className="fg-chip merged" x="360" y="116" width="62" height="20" rx="10" />
        <text className="fg-chip-text merged" x="391" y="130" textAnchor="middle">
          merged
        </text>
        <circle className="fg-packet" r="4" style={{ offsetPath: `path('${B1}')` }} />
        <circle className="fg-packet two" r="4" style={{ offsetPath: `path('${B2}')` }} />
      </svg>
    </div>
  );
}
