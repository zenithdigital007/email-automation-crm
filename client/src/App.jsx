import Dashboard from './pages/Dashboard';

export default function App() {
  return (
    <div className="app-wrapper">
      <nav className="topnav">
        <a className="topnav-brand" href="/">
          <span className="dot" />
          Email Automation CRM
        </a>
        <div className="topnav-tabs">
          <button className="tab-btn active">Dashboard</button>
        </div>
      </nav>

      <Dashboard />

      <footer className="footer">
        Email Automation CRM · MVP
      </footer>
    </div>
  );
}
