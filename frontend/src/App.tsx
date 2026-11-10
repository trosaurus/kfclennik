import { Routes, Route, Navigate } from 'react-router-dom';
import { TeamProvider, useTeam } from './lib/TeamContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Wedstrijd, { WedstrijdLijst } from './pages/Wedstrijd';
import Spelers from './pages/Spelers';
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
      {/* Trainingsmodus: schermvullend, zonder zijbalk */}
      <Route path="/trainingen/:id/modus" element={<TrainingsModus />} />

      <Route element={<Layout />}>
        <Route index element={<Navigate to="/trainingen" replace />} />

        {/* Trainen */}
        <Route path="/trainingen"     element={<Trainingen />} />
        <Route path="/trainingen/:id" element={<TrainingEditor />} />
        <Route path="/oefendatabank"  element={<Oefendatabank />} />
        <Route path="/whiteboard"     element={<Whiteboard />} />
        <Route path="/tactiek"        element={<Tactiek />} />

        {/* Wedstrijd */}
        <Route path="/wedstrijden"            element={<WedstrijdLijst />} />
        <Route path="/wedstrijden/:id"        element={<Wedstrijd />} />
        <Route path="/wedstrijden/:id/:stap"  element={<Wedstrijd />} />
        <Route path="/spelers"                element={<Spelers />} />

        <Route path="/admin" element={trainer.role === 'admin' ? <Admin /> : <Navigate to="/" replace />} />

        {/* Oude adressen uit de vorige app */}
        <Route path="/matchday"   element={<Navigate to="/wedstrijden" replace />} />
        <Route path="/match-live" element={<Navigate to="/wedstrijden" replace />} />
        <Route path="/schema"     element={<Navigate to="/wedstrijden" replace />} />
        <Route path="/matches/*"  element={<Navigate to="/wedstrijden" replace />} />
        <Route path="/seizoen"    element={<Navigate to="/spelers" replace />} />
        <Route path="/profiel"    element={<Navigate to="/spelers" replace />} />
        <Route path="*"           element={<Navigate to="/trainingen" replace />} />
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
