import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

if (import.meta.env.VITE_HASH_ROUTER && !window.location.hash) window.location.hash = "#/studio";

createRoot(document.getElementById("root")!).render(<App />);

// Studio instalável no celular (PWA) e avisos (Web Push): o service worker não guarda cache
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
