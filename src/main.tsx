import React, { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('RG Pharma-POS render error:', error, info);
  }

  handleReload = () => window.location.reload();

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f1f5f9', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 10px 30px rgba(0,0,0,.12)' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>RG Pharma-POS could not load</h1>
          <p style={{ margin: '0 0 16px', color: '#475569' }}>The application encountered a startup error. Your Supabase data has not been deleted.</p>
          <button onClick={this.handleReload} style={{ border: 0, borderRadius: 10, padding: '10px 16px', background: '#0f766e', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>Reload application</button>
          {this.state.message && <details style={{ marginTop: 16 }}><summary style={{ cursor: 'pointer' }}>Technical details</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#7f1d1d', marginTop: 8 }}>{this.state.message}</pre></details>}
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
