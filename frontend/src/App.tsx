import { Routes, Route, Navigate } from 'react-router-dom';
import { TeamProvider, useTeam } from './lib/TeamContext';
import Layout from './components/Layout';
import SectionTabs from './components/SectionTabs';
import Login from './pages/Login';
import Home from './pages/Home';
import Matchday from './pages/Matchday';
import SpelerBeheer from './pages/SpelerBeheer';
import WedstrijdBeheer from './pages/WedstrijdBeheer';
import Seizoen from './pages/Seizoen';
import Trainingen from './pages/Trainingen';
import TrainingEditor from './pages/TrainingEditor';
import TrainingsModus from './pages/TrainingsModus';
import Oefendatabank from './pages/Oefendatabank';
import Whiteboard from './pages/Whiteboard';
import Tactiek from './pages/Tactiek';
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
        <Route index element={<Home />} />
        <Route path="/matchday"    element={<Matchday />} />

        <Route element={<SectionTabs tabs={[
          { to: '/spelers',     label: 'Spelers',     icon: '👥' },
          { to: '/wedstrijden', label: 'Wedstrijden', icon: '📋' },
          { to: '/seizoen',     label: 'Seizoen',      icon: '📈' },
        ]} />}>
          <Route path="/spelers"     element={<SpelerBeheer />} />
          <Route path="/wedstrijden" element={<WedstrijdBeheer />} />
          <Route path="/seizoen"     element={<Seizoen />} />
        </Route>

        <Route element={<SectionTabs tabs={[
          { to: '/trainingen',    label: 'Trainingen', icon: '📝' },
          { to: '/oefendatabank', label: 'Oefeningen', icon: '📚' },
          { to: '/whiteboard',    label: 'Whiteboard', icon: '🎨' },
        ]} />}>
          <Route path="/trainingen"    element={<Trainingen />} />
          <Route path="/oefendatabank" element={<Oefendatabank />} />
          <Route path="/whiteboard"    element={<Whiteboard />} />
        </Route>

        <Route path="/trainingen/:id" element={<TrainingEditor />} />
        <Route path="/tactiek"        element={<Tactiek />} />
        <Route path="/admin"       element={trainer.role === 'admin' ? <Admin /> : <Navigate to="/" replace />} />
        <Route path="/matches"     element={<Navigate to="/wedstrijden" replace />} />
        <Route path="/matches/:id" element={<Navigate to="/wedstrijden" replace />} />
        <Route path="/profiel"     element={<Navigate to="/spelers" replace />} />
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
