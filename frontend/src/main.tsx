import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ThemeProvider } from './lib/ThemeContext';
import { FontProvider } from './lib/FontContext';
import './index.css';

document.documentElement.setAttribute('data-theme', localStorage.getItem('kfcl-theme') || 'dark');
document.documentElement.setAttribute('data-font', localStorage.getItem('kfcl-font') || 'default');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <FontProvider>
          <App />
        </FontProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
