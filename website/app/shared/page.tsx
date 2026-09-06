'use client';

import AppShell, { Icon, ScoreRing, PageHeading } from '@/components/AppShell';
import { useStore } from '@/lib/store';
import { sharedNotebooks, scoreLabel } from '@/lib/mock-data';

export default function SharedPage() {
  const { notebooks } = useStore();
  const myPublic = notebooks.filter((n) => n.visibility === 'Public');

  return (
    <AppShell active="Shared with me">
      <PageHeading
        eyebrow="Community"
        title="Shared with me"
        subtitle="Public notebooks other researchers on the platform have chosen to share."
        status={`${sharedNotebooks.length} public notebooks - preview data`}
      />

      <section className="panel notebooks-panel">
        <div className="panel-heading"><div><h2>From other workspaces</h2><p>Read-only previews of notebooks marked public by their owners</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Notebook</th><th>Owner</th><th>Classification</th><th>Score</th><th>Shared</th></tr></thead>
            <tbody>{sharedNotebooks.map((n) => (
              <tr key={n.id}>
                <td><span className="notebook-cell"><i className="file-icon">&#9638;</i><span><strong>{n.title}</strong><small>{n.repository} - {n.platform}</small></span></span></td>
                <td>
                  <span className="shared-row">
                    <span className="avatar sm">{n.ownerInitials}</span>
                    <span className="who"><strong>{n.owner}</strong></span>
                  </span>
                </td>
                <td><span className="category"><Icon name="spark" size={13} />{n.category}</span></td>
                <td><span className="score-cell"><ScoreRing score={n.score} /><small>{scoreLabel(n.score)}</small></span></td>
                <td className="muted">{n.sharedOn}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="panel notebooks-panel" style={{ marginTop: 18 }}>
        <div className="panel-heading"><div><h2>Notebooks you have made public</h2><p>Anyone with the link can view these read-only analyses</p></div><span className="count-badge">{myPublic.length}</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Notebook</th><th>Classification</th><th>Score</th><th>Updated</th></tr></thead>
            <tbody>{myPublic.map((n) => (
              <tr key={n.id}>
                <td><span className="notebook-cell"><i className="file-icon">&#9638;</i><span><strong>{n.title}</strong></span></span></td>
                <td><span className="category"><Icon name="spark" size={13} />{n.finalCategory}</span></td>
                <td><span className="score-cell"><ScoreRing score={n.score} /><small>{scoreLabel(n.score)}</small></span></td>
                <td className="muted">{n.updated}</td>
              </tr>
            ))}</tbody>
          </table>
          {myPublic.length === 0 && <p style={{ padding: 18, color: 'var(--fg-subtle)', fontSize: 9.5 }}>You have not made any notebooks public yet.</p>}
        </div>
      </section>
    </AppShell>
  );
}
