import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Lead, LeadSearch, LeadStatus } from "../lib/types";

export const LEAD_STATUS: Record<LeadStatus, { label: string; color: string }> = {
  new: { label: "Novo", color: "#2563eb" },
  contacted: { label: "Contatado", color: "#d97706" },
  replied: { label: "Respondeu", color: "#7c3aed" },
  won: { label: "Fechou", color: "#16a34a" },
  lost: { label: "Descartado", color: "#9ca3af" },
};

/** Cor da área no mapa: vermelho = já prospectado; laranja = buscando agora; cinza = falhou (não conta). */
export function areaColor(status: LeadSearch["status"]) {
  return status === "done" ? "#E3262E" : status === "failed" ? "#9ca3af" : "#f59e0b";
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Mapa (OpenStreetMap): áreas já pesquisadas pintadas pela cor do tema e cada lead como um ponto. */
export default function LeadsMap({ searches, leads }: { searches: LeadSearch[]; leads: Lead[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    let alive = true;
    import("leaflet").then((L) => {
      if (!alive || !el.current || map.current) return;
      map.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([-15.79, -47.88], 10);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      draw(L);
    });
    return () => {
      alive = false;
      map.current?.remove();
      map.current = null;
      fitted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draw = (L: typeof import("leaflet")) => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    const bounds = L.latLngBounds([]);
    for (const s of searches) {
      if (!s.bbox) continue;
      const [south, north, west, east] = s.bbox;
      const color = areaColor(s.status);
      L.rectangle([[south, west], [north, east]], {
        color, weight: 2, fillColor: color, fillOpacity: s.status === "done" ? 0.22 : 0.1, dashArray: s.status === "done" ? undefined : "6 6",
      })
        .bindTooltip(`${esc(s.query)} · ${esc(s.place)} (${s.found} leads)`)
        .addTo(layer.current);
      bounds.extend([[south, west], [north, east]]);
    }
    for (const l of leads) {
      if (l.lat == null || l.lng == null) continue;
      L.circleMarker([l.lat, l.lng], { radius: 6, color: "#fff", weight: 1.5, fillColor: LEAD_STATUS[l.status].color, fillOpacity: 0.95 })
        .bindPopup(`<b>${esc(l.name)}</b><br>${esc(l.category ?? "")}<br>${LEAD_STATUS[l.status].label}`)
        .addTo(layer.current);
    }
    if (!fitted.current && bounds.isValid()) {
      map.current.fitBounds(bounds, { padding: [20, 20], maxZoom: 14 });
      fitted.current = true;
    }
  };

  useEffect(() => {
    import("leaflet").then(draw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searches, leads]);

  return <div ref={el} className="relative z-0 h-[340px] w-full overflow-hidden rounded-md border sm:h-[420px]" />;
}
