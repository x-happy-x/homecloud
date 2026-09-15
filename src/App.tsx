import { LegacyShell } from './components/LegacyShell';
import { useEffect } from 'react';

export function App() {
  useEffect(() => {
    void import('./legacyApp.js');
  }, []);

  return <LegacyShell />;
}
