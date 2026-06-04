import { useState } from 'react';
import { login } from '../lib/auth';
import { useTeam } from '../lib/TeamContext';
import logo from '../assets/Logo-KFC-Lennik.png';
import './Login.css';

export default function Login() {
  const { setTrainer } = useTeam();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.ok && result.trainer) {
        setTrainer(result.trainer);
      } else {
        setError(result.message ?? 'Ongeldig e-mailadres of wachtwoord');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verbindingsfout');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg" />
      <div className="login-card">
        <div className="login-logo">
          <img src={logo} alt="KFC Lennik" />
        </div>
        <div className="login-title">KFC Lennik</div>
        <div className="login-subtitle">Trainer portaal</div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="input-label">E-mailadres</label>
            <input
              className="input-field"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="trainer@kfclennik.be"
              autoFocus
              autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label className="input-label">Wachtwoord</label>
            <input
              className="input-field"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="login-error">
              ⚠ {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary login-btn"
            disabled={loading || !email || !password}
          >
            {loading ? 'Aanmelden...' : 'Aanmelden'}
          </button>
        </form>

        <p className="login-hint">
          Eerste keer? Maak een account aan via de <a href="http://localhost:3000/admin" target="_blank" rel="noreferrer">Admin UI</a>.
        </p>
      </div>
    </div>
  );
}
