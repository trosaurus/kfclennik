import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; resetKey?: string }
interface State { error: Error | null }

/** Vangt render-fouten van een pagina op en toont de melding, i.p.v. dat React
 * de hele app wegveegt tot een blanke pagina. `resetKey` (bv. het pad) wist de
 * fout weer zodra je naar een andere pagina navigeert. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error(error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="page">
        <div className="card" style={{ padding: 20, borderTop: '3px solid var(--danger)' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', marginBottom: 8 }}>Er ging iets mis op deze pagina</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--text-mid)', marginBottom: 12 }}>
            {error.message}
            {error.stack ? `\n\n${error.stack.split('\n').slice(0, 6).join('\n')}` : ''}
          </pre>
          <button className="btn btn-outline btn-sm" onClick={() => this.setState({ error: null })}>Opnieuw proberen</button>
        </div>
      </div>
    );
  }
}
