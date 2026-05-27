import React from 'react';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('MAROPACK module error:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ padding: 24, background: '#f8fafc', minHeight: 360 }}>
        <div style={{ maxWidth: 760, margin: '40px auto', background: '#fff', border: '1px solid #fecaca', borderRadius: 18, padding: 24, boxShadow: '0 12px 30px rgba(15,23,42,.08)' }}>
          <div style={{ fontSize: 42 }}>⚠️</div>
          <h2 style={{ margin: '10px 0', color: '#991b1b' }}>Modul je naišao na grešku</h2>
          <p style={{ color: '#475569' }}>Aplikacija nije srušena. Vrati se na drugi modul ili osveži stranicu. Greška je zapisana u konzoli za proveru.</p>
          <pre style={{ background: '#fef2f2', color: '#991b1b', borderRadius: 12, padding: 12, whiteSpace: 'pre-wrap', fontSize: 12 }}>{String(this.state.error?.message || this.state.error || 'Nepoznata greška')}</pre>
          <button onClick={() => this.setState({ hasError: false, error: null })} style={{ background: '#991b1b', color: '#fff', border: 0, borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: 'pointer' }}>Pokušaj ponovo</button>
        </div>
      </div>
    );
  }
}
