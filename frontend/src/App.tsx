import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Matchday from './pages/Matchday';
import SpelerBeheer from './pages/SpelerBeheer';
import WedstrijdBeheer from './pages/WedstrijdBeheer';
import Seizoen from './pages/Seizoen';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Matchday />} />
        <Route path="/spelers"     element={<SpelerBeheer />} />
        <Route path="/wedstrijden" element={<WedstrijdBeheer />} />
        <Route path="/seizoen"     element={<Seizoen />} />
        <Route path="/matches"     element={<Navigate to="/wedstrijden" replace />} />
        <Route path="/matches/:id" element={<Navigate to="/wedstrijden" replace />} />
      </Route>
    </Routes>
  );
}
