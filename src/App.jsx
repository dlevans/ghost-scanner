import { useEffect, useState } from 'react';
import GhostScanner from './components/GhostScanner.jsx';
import MarkerSheet from './components/MarkerSheet.jsx';
import GhostBuilder from './components/GhostBuilder.jsx';

// Tiny hash router: "#/markers" is the printable marker sheet, "#/builder" the ghost builder,
// anything else is the scanner.
function useRoute() {
  const [route, setRoute] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export default function App() {
  const route = useRoute();
  if (route.startsWith('#/markers')) return <MarkerSheet />;
  if (route.startsWith('#/builder')) return <GhostBuilder />;
  return <GhostScanner />;
}
