import { useState } from 'react';
import { login, getMe } from '../lib/auth';
import { useTeam } from '../lib/TeamContext';
import { APP_NAME, APP_LOGO } from '../lib/brand';
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
        // Opnieuw ophalen ná het aanmelden: tijdens de login-mutatie zelf is er
        // nog geen sessie, waardoor de (ploeg-gescopete) ploeg en club in het
        // antwoord van die mutatie nog leeg zijn.
        setTrainer((await getMe()) ?? result.trainer);
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
      <aside className="login-hero" aria-hidden="true">
        <div className="login-pitch">
          <span className="pitch-line pitch-mid" />
          <span className="pitch-circle" />
          <span className="pitch-box pitch-box-top" />
          <span className="pitch-box pitch-box-bottom" />
        </div>
        <div className="login-hero-text">
          <img src={APP_LOGO} alt="" className="login-hero-logo" />
          <h1>Trainen, coachen,<br />speeltijd eerlijk verdelen.</h1>
          <p>Trainingen · Oefeningen · Tekentool · Tactiek · Wedstrijd live</p>
        </div>
      </aside>

      <div className="login-card">
        <div className="login-brand">
          <img src={APP_LOGO} alt={APP_NAME} />
          <div>
            <div className="login-title">{APP_NAME}</div>
            <div className="login-subtitle">Trainersportaal voor jeugdvoetbal</div>
          </div>
        </div>
        <h2 className="login-heading">Aanmelden</h2>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="input-label">E-mailadres</label>
            <input
              className="input-field"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="trainer@jouwclub.be"
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
              {error}
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
