import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "../../components/ui/Button";

/**
 * Mapa do cadastro: busca de endereço (Nominatim/OpenStreetMap), marcador
 * arrastável e clique para posicionar. Sem chave de API.
 */

const DEFAULT_CENTER: [number, number] = [-14.235, -51.9253]; // Brasil
const markerIcon = L.divIcon({
  className: "",
  html: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,.35))"><path d="M12 2a7 7 0 00-7 7c0 4.9 5.4 10.9 6.6 12.2a.55.55 0 00.8 0C13.6 19.9 19 13.9 19 9a7 7 0 00-7-7z" fill="#D2502E"/><circle cx="12" cy="9" r="2.6" fill="white"/></svg>`,
  iconSize: [34, 34],
  iconAnchor: [17, 32],
});

interface MapPickerProps {
  latitude: number | null;
  longitude: number | null;
  searchHint?: string;
  onChange: (lat: number, lng: number) => void;
}

export function MapPicker({ latitude, longitude, searchHint, onChange }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const hasPoint = latitude != null && longitude != null;
    const map = L.map(containerRef.current, { zoomControl: true }).setView(
      hasPoint ? [latitude, longitude] : DEFAULT_CENTER,
      hasPoint ? 16 : 4,
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      placeMarker(e.latlng.lat, e.latlng.lng);
      onChangeRef.current(round(e.latlng.lat), round(e.latlng.lng));
    });

    mapRef.current = map;
    if (hasPoint) placeMarker(latitude, longitude);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (latitude != null && longitude != null && mapRef.current) {
      placeMarker(latitude, longitude);
    }
  }, [latitude, longitude]);

  function placeMarker(lat: number, lng: number) {
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const marker = L.marker([lat, lng], { icon: markerIcon, draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        onChangeRef.current(round(pos.lat), round(pos.lng));
      });
      markerRef.current = marker;
    }
  }

  async function geocode() {
    const query = search.trim() || searchHint?.trim();
    if (!query) {
      setSearchError("Digite um endereço para buscar.");
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`,
        { headers: { Accept: "application/json" } },
      );
      const results = (await response.json()) as { lat: string; lon: string }[];
      if (!results.length) {
        setSearchError("Endereço não encontrado. Ajuste a busca ou clique direto no mapa.");
        return;
      }
      const lat = round(Number(results[0].lat));
      const lng = round(Number(results[0].lon));
      mapRef.current?.setView([lat, lng], 17);
      placeMarker(lat, lng);
      onChangeRef.current(lat, lng);
    } catch {
      setSearchError("Não foi possível buscar agora. Clique direto no mapa.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void geocode();
            }
          }}
          placeholder={searchHint || "Buscar endereço no mapa"}
          className="min-h-[var(--tap-target-min)] w-full rounded-md border border-border bg-surface px-3.5 text-body text-text placeholder:text-text-subtle focus-visible:border-[var(--border-focus)] focus-visible:shadow-focus"
        />
        <Button type="button" variant="ghost" loading={searching} onClick={() => void geocode()}>
          Buscar
        </Button>
      </div>
      {searchError && <p className="text-caption text-[var(--danger-fg)]">{searchError}</p>}
      <div
        ref={containerRef}
        className="h-64 w-full overflow-hidden rounded-xl border border-border sm:h-72"
        aria-label="Mapa para posicionar o imóvel"
      />
      <p className="text-caption text-text-subtle">
        Clique no mapa ou arraste o marcador para ajustar o ponto exato.
        {latitude != null && longitude != null && (
          <span className="tabular-nums"> Coordenadas: {latitude}, {longitude}.</span>
        )}
      </p>
    </div>
  );
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
