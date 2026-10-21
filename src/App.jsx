import { useEffect, useState } from 'react';
import GhostScanner from './components/GhostScanner.jsx';
import MarkerSheet from './components/MarkerSheet.jsx';

// Tiny hash router: "#/markers" is the printable marker sheet, anything else is the scanner.
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
  return route.startsWith('#/markers') ? <MarkerSheet /> : <GhostScanner />;
}
