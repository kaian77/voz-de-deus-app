import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

if (import.meta.env.VITE_HASH_ROUTER && !window.location.hash) window.location.hash = "#/studio";

createRoot(document.getElementById("root")!).render(<App />);
