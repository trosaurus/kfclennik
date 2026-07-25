import { Routes, Route, Navigate } from 'react-router-dom';
import { TeamProvider, useTeam } from './lib/TeamContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Matchday from './pages/Matchday';
import SpelerBeheer from './pages/SpelerBeheer';
import WedstrijdBeheer from './pages/WedstrijdBeheer';
import Seizoen from './pages/Seizoen';
import SpelerProfiel from './pages/SpelerProfiel';
import Trainingen from './pages/Trainingen';
import TrainingEditor from './pages/TrainingEditor';
import TrainingsModus from './pages/TrainingsModus';
import Admin from './pages/Admin';

function AppRoutes() {
  const { trainer, loading } = useTeam();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading-spinner">Laden...</div>
      </div>
    );
  }

  if (!trainer) return <Login />;

  return (
    <Routes>
      <Route path="/trainingen/:id/modus" element={<TrainingsModus />} />
      <Route element={<Layout />}>
        <Route index element={<Matchday />} />
        <Route path="/spelers"     element={<SpelerBeheer />} />
        <Route path="/wedstrijden" element={<WedstrijdBeheer />} />
        <Route path="/seizoen"     element={<Seizoen />} />
        <Route path="/profiel"     element={<SpelerProfiel />} />
        <Route path="/trainingen"     element={<Trainingen />} />
        <Route path="/trainingen/:id" element={<TrainingEditor />} />
        <Route path="/admin"       element={trainer.role === 'admin' ? <Admin /> : <Navigate to="/" replace />} />
        <Route path="/matches"     element={<Navigate to="/wedstrijden" replace />} />
        <Route path="/matches/:id" element={<Navigate to="/wedstrijden" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <TeamProvider>
      <AppRoutes />
    </TeamProvider>
  );
}
