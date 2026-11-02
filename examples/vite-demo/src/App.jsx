import { useState } from 'react'

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">V</span>
        <span>Vibe Demo</span>
      </div>
      <nav>
        <a className="nav-item active" href="#overview">
          Overview
        </a>
        <a className="nav-item" href="#projects">
          Projects
        </a>
        <a className="nav-item" href="#settings">
          Settings
        </a>
      </nav>
      <div className="sidebar-foot">
        <span className="avatar">AL</span>
        <div>
          <strong>Alex Lin</strong>
          <small>alex@vibe.dev</small>
        </div>
      </div>
    </aside>
  )
}

function StatCard({ label, value, trend }) {
  return (
    <article className="stat-card">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-trend">{trend} vs last month</span>
    </article>
  )
}

function ActivityTable() {
  const rows = [
    ['Design system refresh', 'Mia Chen', 'In progress'],
    ['Mobile onboarding', 'Sam Rivera', 'In review'],
    ['API v2 migration', 'Alex Lin', 'Shipped'],
  ]
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Recent projects</h2>
        <span className="pill">View all</span>
      </header>
      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th>Owner</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, owner, status]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{owner}</td>
              <td>
                <span className="status">{status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export function App() {
  const [count, setCount] = useState(3)

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <header className="topbar">
          <div>
            <span className="eyebrow">Workspace / Dashboard</span>
            <h1>Good morning, Alex</h1>
          </div>
          <button
            type="button"
            className="primary-btn"
            onClick={() => setCount((value) => value + 1)}
          >
            New project
            <span className="count">{count}</span>
          </button>
        </header>

        <section className="stats">
          <StatCard label="Total revenue" value="$48,290" trend="↗ 12.4%" />
          <StatCard label="Active users" value="8,942" trend="↗ 5.2%" />
          <StatCard label="Conversion" value="3.84%" trend="↘ 0.4%" />
        </section>

        <section className="split">
          <div className="panel chart-panel">
            <header className="panel-head">
              <div>
                <h2>Revenue overview</h2>
                <p>Last 30 days</p>
              </div>
              <span className="pill">Monthly</span>
            </header>
            <div className="chart">
              <span style={{ height: '42%' }} />
              <span style={{ height: '58%' }} />
              <span style={{ height: '46%' }} />
              <span style={{ height: '72%' }} />
              <span style={{ height: '64%' }} />
              <span style={{ height: '88%' }} />
              <span style={{ height: '79%' }} />
              <span style={{ height: '96%' }} />
            </div>
          </div>

          <ActivityTable />
        </section>

        <section className="panel notes">
          <header className="panel-head">
            <h2>Try the canvas</h2>
            <span className="pill">Live DOM</span>
          </header>
          <p>
            这是真实运行中的 Vite + React 页面。切换到旁注 / 圈画 / 拖拽模式，
            画布会通过 data-source 定位到这里的组件与源码行号。
          </p>
        </section>
      </main>
    </div>
  )
}
