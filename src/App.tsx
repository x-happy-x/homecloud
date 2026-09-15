import {AppShell} from './app/AppShell';
import {Providers} from './app/Providers';

export function App() {
  return (
    <Providers>
      <AppShell />
    </Providers>
  );
}
