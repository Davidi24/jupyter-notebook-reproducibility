'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AppShell, { Icon, PageHeading, ScoreRing } from '@/components/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useStore } from '@/lib/store';
import {
  getRepository,
  averageScore,
  scoreLabel,
  agreementSummary,
  categoryDistribution,
  scoreBuckets,
  platformSummary,
} from '@/lib/mock-data';

type AnalysisTab = 'overview' | 'classifications' | 'reproducibility';

const CATEGORY_COLORS: Record<string, string> = {
  Visualization: '#6366f1',
  'Data analysis': '#06b6d4',
  'Data preparation': '#f59e0b',
  'Machine learning': '#ec4899',
  Modeling: '#8b5cf6',
  Simulation: '#14b8a6',
  Tutorial: '#22c55e',
  'Software development': '#3b82f6',
  'Mixed purpose': '#f97316',
  Uncertain: '#94a3b8',
};

const DEFAULT_CATEGORY_COLOR = '#94a3b8';

function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? DEFAULT_CATEGORY_COLOR;
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.substring(0, 2), 16);
  const g = parseInt(value.substring(2, 4), 16);
  const b = parseInt(value.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function niceAxisMax(maxValue: number): number {
  if (maxValue <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxValue)));
  const residual = maxValue / magnitude;
  let niceResidual: number;
  if (residual > 5) niceResidual = 10;
  else if (residual > 2) niceResidual = 5;
  else if (residual > 1) niceResidual = 2;
  else niceResidual = 1;
  return niceResidual * magnitude;
}

function axisTicks(niceMax: number): number[] {
  const step = niceMax > 20 ? Math.ceil(niceMax / 5 / 5) * 5 : niceMax > 5 ? Math.ceil(niceMax / 5) : 1;
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] !== niceMax) ticks.push(niceMax);
  return ticks;
}

function VerticalBarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const rawMax = Math.max(1, ...data.map((d) => d.value));
  const niceMax = niceAxisMax(rawMax);
  const ticks = axisTicks(niceMax).slice().reverse();

  return (
    <div className="vbar-chart">
      <div className="vbar-plot-wrap">
        <div className="vbar-yaxis">
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / niceMax) * 100}%` }}>{t}</span>
          ))}
        </div>
        <div className="vbar-plot">
          {ticks.map((t) => (
            <div key={t} className="vbar-gridline" style={{ bottom: `${(t / niceMax) * 100}%` }} />
          ))}
          <div className="vbar-bars">
            {data.map((d) => (
              <div className="vbar-col" key={d.label}>
                <span className="vbar-count">{d.value}</span>
                <div
                  className="vbar-bar"
                  style={{ height: `${(d.value / niceMax) * 100}%`, background: `linear-gradient(180deg, ${hexToRgba(d.color, 0.5)}, ${d.color})` }}
                  title={`${d.label}: ${d.value}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="vbar-xaxis-row">
        <div className="vbar-yaxis-spacer" />
        <div className="vbar-xaxis">
          {data.map((d) => <span key={d.label}>{d.label}</span>)}
        </div>
      </div>
    </div>
  );
}

type DonutSegment = { label: string; value: number; color: string };

function DonutChart({ segments, centerValue, centerLabel, size = 168, thickness = 24 }: {
  segments: DonutSegment[];
  centerValue: string;
  centerLabel: string;
  size?: number;
  thickness?: number;
}) {
  const total = Math.max(1, segments.reduce((sum, s) => sum + s.value, 0));
  const gapDeg = segments.length > 1 ? 3 : 0;
  let cursor = 0;
  const stops: string[] = [];
  segments.forEach((s) => {
    const fraction = s.value / total;
    const startDeg = cursor * 360;
    const endDeg = (cursor + fraction) * 360;
    const trimmedEnd = Math.max(startDeg, endDeg - gapDeg);
    stops.push(`${s.color} ${startDeg}deg ${trimmedEnd}deg`);
    stops.push(`transparent ${trimmedEnd}deg ${endDeg}deg`);
    cursor += fraction;
  });
  const background = segments.length === 0 ? 'var(--border-muted)' : `conic-gradient(${stops.join(', ')})`;

  return (
    <div className="donut-ring" style={{ width: size, height: size, background }}>
      <div className="donut-hole" style={{ inset: thickness }}>
        <strong>{centerValue}</strong>
        <span>{centerLabel}</span>
      </div>
    </div>
  );
}

const TABS: { id: AnalysisTab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'classifications', label: 'Classifications', icon: 'tag' },
  { id: 'reproducibility', label: 'Reproducibility', icon: 'chart' },
];

const HEADINGS: Record<AnalysisTab, { title: string; subtitle: string }> = {
  overview: {
    title: 'Good evening, David.',
    subtitle: 'Here is what is happening across your notebook workspace.',
  },
  classifications: {
    title: 'Classifications',
    subtitle: 'Rule-based and local-LLM classification results, and where they disagree.',
  },
  reproducibility: {
    title: 'Reproducibility',
    subtitle: 'How closely re-executed notebooks match their original published outputs.',
  },
};

function isAnalysisTab(value: string | null): value is AnalysisTab {
  return value === 'overview' || value === 'classifications' || value === 'reproducibility';
}

function AnalysisTabs({ active, onChange }: { active: AnalysisTab; onChange: (tab: AnalysisTab) => void }) {
  return (
    <div className="tab-row" role="tablist" aria-label="Analysis sections">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={`filter-chip ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <Icon name={t.icon} size={13} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

function OverviewSection() {
  const { notebooks, repositories } = useStore();
  const recent = notebooks.slice(0, 5);
  const publicCount = notebooks.filter((n) => n.visibility === 'Public').length;
  const avg = averageScore(notebooks);
  const platformCount = new Set(repositories.map((r) => r.platform)).size;
  const { disagreed } = agreementSummary(notebooks);

  return (
    <>
      <section className="metric-grid" aria-label="Workspace summary">
        <Card className="metric-card"><CardContent><span className="metric-icon blue"><Icon name="book" /></span><div><p>My notebooks</p><strong>{notebooks.length}</strong><small><b>+3</b> this month</small></div></CardContent></Card>
        <Card className="metric-card"><CardContent><span className="metric-icon violet"><Icon name="branch" /></span><div><p>Repositories</p><strong>{repositories.length}</strong><small>Across {platformCount} platforms</small></div></CardContent></Card>
        <Card className="metric-card"><CardContent><span className="metric-icon green"><Icon name="chart" /></span><div><p>Avg. reproducibility</p><strong>{avg}%</strong><small><b>up 4%</b> from last run</small></div></CardContent></Card>
        <Card className="metric-card"><CardContent><span className="metric-icon amber"><Icon name="globe" /></span><div><p>Public notebooks</p><strong>{publicCount}</strong><small>{notebooks.length - publicCount} remain private</small></div></CardContent></Card>
      </section>

      <div className="main-grid">
        <Card className="panel notebooks-panel">
          <CardHeader className="panel-heading"><div><CardTitle>Recent notebooks</CardTitle><CardDescription>Classification and reproducibility at a glance</CardDescription></div><Link className="text-button" href="/notebooks">View all <Icon name="arrow" size={15} /></Link></CardHeader>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Notebook</th><th>Classification</th><th>Score</th><th>Visibility</th><th>Updated</th><th /></tr></thead>
              <tbody>{recent.map((item) => {
                const repo = getRepository(repositories, item.repositoryId);
                return (
                <tr key={item.id}>
                  <td><Link href={`/notebooks/${item.id}`} className="notebook-cell"><i className="file-icon">&#9638;</i><span><strong>{item.title}</strong><small>{repo?.name} - {repo?.platform}</small></span></Link></td>
                  <td><Badge className="category" variant="secondary"><Icon name="spark" size={13} />{item.finalCategory}</Badge></td>
                  <td><span className="score-cell"><ScoreRing score={item.score} /><small>{scoreLabel(item.score)}</small></span></td>
                  <td><span className={`visibility ${item.visibility.toLowerCase()}`}><Icon name={item.visibility === 'Public' ? 'globe' : 'lock'} size={12} />{item.visibility}</span></td>
                  <td className="muted">{item.updated}</td><td><button className="row-menu" aria-label={`Options for ${item.title}`} type="button">...</button></td>
                </tr>
              );})}</tbody>
            </table>
          </div>
        </Card>

        <aside className="right-column">
          <Card className="panel attention-panel">
            <CardHeader className="panel-heading"><div><CardTitle>Needs attention</CardTitle><CardDescription>Quick improvements</CardDescription></div><Badge className="count-badge" variant="secondary">2</Badge></CardHeader>
            <div className="attention-item"><span className="attention-icon amber"><Icon name="chart" size={17} /></span><div><strong>Improve reproducibility</strong><p>model_training.ipynb is missing an environment file.</p><Link href="/notebooks/model-training">Review notebook <Icon name="arrow" size={13} /></Link></div></div>
            <div className="attention-item"><span className="attention-icon violet"><Icon name="tag" size={17} /></span><div><strong>Confirm classification</strong><p>{disagreed} notebooks have rule/AI classifiers that disagree.</p><Link href="/analysis?tab=classifications">Open review <Icon name="arrow" size={13} /></Link></div></div>
          </Card>

          <Card className="sharing-card">
            <div className="sharing-art"><span><Icon name="lock" size={20} /></span><i /><i /><i /></div>
            <p className="eyebrow">Optional public sharing</p>
            <h2>Your work stays private.</h2>
            <p>Publish only the notebooks you choose. You can remove public access at any time.</p>
            <Link className="button share-button" href="/shared">Manage sharing <Icon name="arrow" size={15} /></Link>
          </Card>
        </aside>
      </div>
    </>
  );
}

function ClassificationsSection() {
  const { notebooks, repositories } = useStore();
  const distribution = categoryDistribution(notebooks);
  const { agreed, disagreed, total } = agreementSummary(notebooks);
  const agreementBase = Math.max(1, total);
  const reviewQueue = notebooks.filter((n) => n.humanReview);
  const chartData = distribution.map((d) => ({ label: d.category, value: d.count, color: categoryColor(d.category) }));

  return (
    <div className="tri-grid">
      <section className="panel">
        <div className="panel-heading"><div><h2>Category distribution</h2><p>Final category across your workspace</p></div></div>
        <VerticalBarChart data={chartData} />
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h2>Rule vs. AI agreement</h2><p>gemma3:4b hybrid classifier vs. the weighted rule-based classifier</p></div></div>
        <div className="donut-panel-body">
          <DonutChart
            segments={[
              { label: 'Agreed', value: agreed, color: 'var(--success-fg)' },
              { label: 'Disagreed', value: disagreed, color: 'var(--attention-fg)' },
            ]}
            centerValue={`${Math.round((agreed / agreementBase) * 100)}%`}
            centerLabel="Agreed"
          />
          <div className="donut-legend">
            <span><i style={{ background: 'var(--success-fg)' }} />Agreed<b>{Math.round((agreed / agreementBase) * 100)}%</b></span>
            <span><i style={{ background: 'var(--attention-fg)' }} />Disagreed<b>{Math.round((disagreed / agreementBase) * 100)}%</b></span>
          </div>
        </div>
      </section>

      <section className="panel attention-panel">
        <div className="panel-heading"><div><h2>Human review queue</h2><p>Low-confidence or disagreeing notebooks</p></div><span className="count-badge">{reviewQueue.length}</span></div>
        {reviewQueue.map((n) => {
          const repo = getRepository(repositories, n.repositoryId);
          return (
            <div className="review-item" key={n.id}>
              <div>
                <strong style={{ display: 'block', color: 'var(--fg)', fontSize: 9.5, fontWeight: 650 }}>{n.title}</strong>
                <div className="cats">rule: <b>{n.ruleCategory}</b> - ai: <b>{n.aiCategory}</b></div>
                <small style={{ color: 'var(--fg-subtle)', fontSize: 8 }}>{repo?.name} - confidence {n.confidence === null ? 'pending' : `${Math.round(n.confidence * 100)}%`}</small>
              </div>
              <Link href={`/notebooks/${n.id}`} className="text-button" style={{ whiteSpace: 'nowrap' }}>Review <Icon name="arrow" size={13} /></Link>
            </div>
          );
        })}
        {reviewQueue.length === 0 && <p style={{ padding: 18, color: 'var(--fg-subtle)', fontSize: 9.5 }}>Nothing needs review right now.</p>}
      </section>
    </div>
  );
}

function ReproducibilitySection() {
  const { notebooks, repositories } = useStore();
  const avg = averageScore(notebooks);
  const buckets = scoreBuckets(notebooks);
  const maxBucket = Math.max(1, ...buckets.map((b) => b.count));
  const byPlatform = platformSummary(repositories, notebooks);
  const needsAttention = notebooks
    .filter((notebook) => notebook.score !== null)
    .sort((a, b) => (a.score as number) - (b.score as number))
    .slice(0, 4);

  return (
    <>
      <section className="metric-grid" aria-label="Reproducibility by platform">
        {byPlatform.map((p) => (
          <Card className="metric-card" key={p.platform}>
            <CardContent>
              <span className="metric-icon blue"><Icon name="branch" /></span>
              <div>
                <p>{p.platform}</p>
                <strong>{p.avgScore}%</strong>
                <small>{p.notebookCount} notebooks - {p.repoCount} repo{p.repoCount === 1 ? '' : 's'}</small>
              </div>
            </CardContent>
          </Card>
        ))}
        <Card className="metric-card">
          <CardContent>
            <span className="metric-icon green"><Icon name="chart" /></span>
            <div><p>Workspace average</p><strong>{avg}%</strong><small>Across all {notebooks.length} notebooks</small></div>
          </CardContent>
        </Card>
      </section>

      <div className="split-grid">
        <section className="panel">
          <div className="panel-heading"><div><h2>Score distribution</h2><p>Notebooks grouped by reproducibility band</p></div></div>
          <div style={{ padding: 20 }}>
            <div className="bar-list">
              {buckets.map((b) => (
                <div className="bar-row" key={b.label}>
                  <span className="bar-label">{b.label}</span>
                  <div className="bar-track"><span className={`bar-fill tone-${b.tone}`} style={{ width: `${(b.count / maxBucket) * 100}%` }} /></div>
                  <span className="bar-count">{b.count}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel attention-panel">
          <div className="panel-heading"><div><h2>Lowest scoring</h2><p>Notebooks that may need attention</p></div></div>
          {needsAttention.map((n) => {
            const repo = getRepository(repositories, n.repositoryId);
            return (
              <div className="attention-item" key={n.id}>
                <ScoreRing score={n.score} size={31} />
                <div>
                  <strong>{n.title}</strong>
                  <p>{repo?.name} - {n.executionNote ?? `${scoreLabel(n.score)} reproducibility`}</p>
                  <Link href={`/notebooks/${n.id}`}>Review notebook <Icon name="arrow" size={13} /></Link>
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </>
  );
}

function AnalysisPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get('tab');
  const tab: AnalysisTab = isAnalysisTab(requested) ? requested : 'overview';

  const { notebooks } = useStore();
  const avg = useMemo(() => averageScore(notebooks), [notebooks]);
  const { total } = useMemo(() => agreementSummary(notebooks), [notebooks]);

  const statusByTab: Record<AnalysisTab, string> = {
    overview: 'Workspace - Up to date',
    classifications: `${total} notebooks classified`,
    reproducibility: `${avg}% average score`,
  };

  function setTab(next: AnalysisTab) {
    router.replace(next === 'overview' ? '/analysis' : `/analysis?tab=${next}`);
  }

  return (
    <AppShell active="Analysis">
      <PageHeading
        eyebrow="Analysis"
        title={HEADINGS[tab].title}
        subtitle={HEADINGS[tab].subtitle}
        status={statusByTab[tab]}
      />

      <AnalysisTabs active={tab} onChange={setTab} />

      <div style={{ marginTop: 20 }}>
        {tab === 'overview' && <OverviewSection />}
        {tab === 'classifications' && <ClassificationsSection />}
        {tab === 'reproducibility' && <ReproducibilitySection />}
      </div>
    </AppShell>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense fallback={null}>
      <AnalysisPageContent />
    </Suspense>
  );
}
