import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Database, LayoutDashboard } from 'lucide-react';
import { DashboardPage } from './pages/DashboardPage';
import { SchemaPage }    from './pages/SchemaPage';
import { RecordsPage }   from './pages/RecordsPage';

function Sidebar() {
  const loc = useLocation();
  const isHome = loc.pathname === '/';

  return (
    <aside style={{
      width: 220, background: 'var(--surface)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', padding: '1.25rem 0',
      position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
    }}>
      <div style={{ padding: '0 1.25rem', marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.625rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, var(--accent), var(--success))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Database size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '.875rem', lineHeight: 1.2 }}>Dados</div>
            <div style={{ fontSize: '.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>/app3</div>
          </div>
        </div>
      </div>

      <nav style={{ padding: '0 .75rem' }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '.75rem',
            padding: '.575rem .875rem', borderRadius: 'var(--radius)',
            marginBottom: '.25rem',
            background: isHome ? 'var(--accent-d)' : 'transparent',
            borderLeft: `2px solid ${isHome ? 'var(--accent)' : 'transparent'}`,
            color: isHome ? 'var(--text)' : 'var(--muted)',
            fontSize: '.875rem', fontWeight: isHome ? 600 : 400,
            transition: 'all .15s',
          }}>
            <LayoutDashboard size={15} />
            Estruturas
          </div>
        </Link>
      </nav>
    </aside>
  );
}

export default function App() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, marginLeft: 220, minHeight: '100vh' }}>
        <Routes>
          <Route path="/"                          element={<DashboardPage />} />
          <Route path="/entities/:entityId"        element={<RecordsPage />} />
          <Route path="/entities/:entityId/schema" element={<SchemaPage />} />
        </Routes>
      </main>
    </div>
  );
}
