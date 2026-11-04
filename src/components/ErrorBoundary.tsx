import { Component, ReactNode } from 'react';

// Evita tela branca: mostra o erro e permite recarregar / limpar dados locais do navegador
export class ErrorBoundary extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state = { erro: null as Error | null };
  static getDerivedStateFromError(erro: Error) { return { erro }; }
  componentDidCatch(erro: Error) { console.error('[ErrorBoundary]', erro); }

  limparERecarregar = () => {
    try {
      const manter = localStorage.getItem('hibiscus-admin-auth-v2');
      localStorage.clear();
      if (manter) localStorage.setItem('hibiscus-admin-auth-v2', manter);
    } catch { /* ignore */ }
    window.location.reload();
  };

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif', background: '#f3f4f6' }}>
        <div style={{ maxWidth: 420, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,.1)' }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Algo deu errado nesta tela</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '8px 0 12px' }}>Tente recarregar. Se continuar, limpe os dados salvos neste navegador.</p>
          <pre style={{ fontSize: 11, background: '#f9fafb', padding: 8, borderRadius: 8, whiteSpace: 'pre-wrap', color: '#b91c1c', margin: '0 0 12px' }}>{String(this.state.erro.message).slice(0, 300)}</pre>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => window.location.reload()} style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: 0, background: '#111827', color: '#fff', fontWeight: 600 }}>Recarregar</button>
            <button onClick={this.limparERecarregar} style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: '1px solid #d1d5db', background: '#fff', fontWeight: 600 }}>Limpar e recarregar</button>
          </div>
        </div>
      </div>
    );
  }
}
