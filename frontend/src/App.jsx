import { Routes, Route, Navigate, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Transactions from './pages/Transactions.jsx';
import Categories from './pages/Categories.jsx';
import Labels from './pages/Labels.jsx';

export default function App() {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span>💰</span>
          <span className="logo-text">PennyPuff</span>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">📊</span>
            Dashboard
          </NavLink>
          <NavLink to="/transactions" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">💳</span>
            Transactions
          </NavLink>
          <NavLink to="/categories" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">🗂️</span>
            Categories
          </NavLink>
          <NavLink to="/labels" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">🏷️</span>
            Labels
          </NavLink>
        </nav>
      </aside>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/labels" element={<Labels />} />
        </Routes>
      </main>
    </div>
  );
}
