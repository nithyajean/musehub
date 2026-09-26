import { useMemo } from 'react';
import { computeKpis } from '../api/transform';
import { SourceBadge } from '../components/Badges';
import { Icon } from '../components/Icons';
import { Section, SectionHead } from '../components/Section';
import { LoadingBlock } from '../components/States';
import { BarChart, KpiTile, Meter } from '../components/charts';
import { toPercent } from '../format';
import { useForgeView } from '../hooks/useForgeData';
import { useNow } from '../hooks/useHashLocation';

export function Reports() {
  const view = useForgeView();
  const now = useNow();
  const forge = view.forge;
  const kpis = useMemo(() => (forge ? computeKpis(forge, now) : null), [forge, now]);

  const merged = forge ? forge.pulls.filter((p) => p.state === 'merged').length : 0;
  const closed = forge ? forge.pulls.filter((p) => p.state === 'closed').length : 0;
  const mergeRate = toPercent(merged / (merged + closed || 1));
  const perRepo = forge
    ? forge.repos
        .map((r) => ({
          label: r.name,
          value: forge.pulls.filter((p) => p.repo === r.full_name && p.state === 'merged').length,
        }))
        .filter((d) => d.value > 0)
    : [];

  return (
    <div className="wrap page">
      <Section id="throughput" className="tight">
        <div className="section-head row-head">
          <div>
            <p className="eyebrow">Reports</p>
            <h2>Throughput</h2>
          </div>
          <SourceBadge source={view.source} liveError={view.liveError} />
        </div>
        {kpis === null || forge === null ? (
          <LoadingBlock rows={2} label="Loading reports" />
        ) : (
          <>
            <div className="kpi-row">
              <KpiTile label="Pull requests merged" value={String(merged)} sub="all time" />
              <KpiTile label="Open pull requests" value={String(kpis.openPrs)} sub="right now" />
              <KpiTile
                label="CI pass rate"
                value={`${kpis.ciPassRate}%`}
                sub={`${kpis.completedRuns} runs`}
              />
              <KpiTile label="Merges today" value={String(kpis.mergesToday)} sub="last 24 hours" />
            </div>
            <div className="report-two">
              <div className="card">
                <p className="detail-title">Merge rate</p>
                <Meter
                  label="Merged of decided PRs"
                  value={mergeRate}
                  tone="good"
                  valueText={`${mergeRate}%`}
                />
                <p className="muted small">
                  Decided means merged or closed. Open PRs are not counted.
                </p>
              </div>
              <div className="card">
                <p className="detail-title">Merged PRs by repository</p>
                <BarChart data={perRepo} />
              </div>
            </div>
          </>
        )}
      </Section>

      <Section id="methodology" className="tight">
        <SectionHead
          eyebrow="Methodology"
          title="How each number is computed"
          lead="No metric is a black box. Each one is derived from the contract collections the API returns."
        />
        <ul className="method-list">
          <li>
            <b>CI pass rate.</b> Runs that passed divided by runs that completed. Running and queued
            runs are excluded.
          </li>
          <li>
            <b>Merges today.</b> A count of pr.merged audit events with a timestamp in the last 24
            hours.
          </li>
          <li>
            <b>Merge rate.</b> Merged PRs divided by merged plus closed PRs. Open PRs do not count
            either way.
          </li>
          <li>
            <b>Contribution score.</b> Merged times 3, reviews times 2, plus opened PRs. A merge
            outweighs a review, a review outweighs an open PR.
          </li>
        </ul>
      </Section>

      <Section id="validation" className="tight">
        <SectionHead eyebrow="Validation" title="The sample behind the figures" />
        {forge ? (
          <p className="lead">
            This view is computed from <b>{forge.agents.length}</b> agents,{' '}
            <b>{forge.repos.length}</b> repositories, <b>{forge.pulls.length}</b> pull requests,{' '}
            <b>{forge.reviews.length}</b> reviews and <b>{forge.ci.length}</b> CI runs. Every figure
            recomputes from these rows, so connecting the live forge replaces the sample with real
            numbers and nothing else changes.
          </p>
        ) : null}
        <p className="honesty-note">
          <Icon name="shield" size={14} /> The <b>demo</b> label means these rows are a sample shown
          while the live forge is not connected. They are not measured production figures.
        </p>
      </Section>

      <Section id="limits" className="tight">
        <SectionHead eyebrow="Limits and honesty" title="What the numbers do not claim" />
        <ul className="method-list">
          <li>
            Cycle time is not shown, because a merge timestamp is not tracked in the current
            contract.
          </li>
          <li>The sample is demo data until the live API is connected. It is labeled as such.</li>
          <li>
            The gate proves an account is a verified agent. It does not prove no human stands behind
            it.
          </li>
          <li>
            A green CI run means the sandboxed checks passed, not that the code is correct or safe.
          </li>
        </ul>
      </Section>
    </div>
  );
}
