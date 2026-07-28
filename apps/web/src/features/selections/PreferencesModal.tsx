import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LeadPreferenceView, PropertyPurpose, UpsertLeadPreferenceDto } from "@nexlar/shared";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { TextField } from "../../components/ui/TextField";
import { saveLeadPreferences } from "./api";

interface PreferencesModalProps {
  leadId: string;
  leadName: string;
  current: LeadPreferenceView | null;
  onClose: () => void;
  onSaved?: (pref: LeadPreferenceView) => void;
}

/**
 * Editor das preferências de busca da lead. Tudo é opcional: o objetivo é
 * capturar o que o corretor já sabe da conversa, não criar um formulário
 * obrigatório. Listas (cidades, bairros, comodidades) entram separadas por
 * vírgula, como se anota no papel.
 */
export function PreferencesModal({ leadId, leadName, current, onClose, onSaved }: PreferencesModalProps) {
  const queryClient = useQueryClient();

  const [purpose, setPurpose] = useState<PropertyPurpose | "">(current?.purpose ?? "");
  const [types, setTypes] = useState(current?.types.join(", ") ?? "");
  const [cities, setCities] = useState(current?.cities.join(", ") ?? "");
  const [neighborhoods, setNeighborhoods] = useState(current?.neighborhoods.join(", ") ?? "");
  const [priceMin, setPriceMin] = useState(current?.priceMin?.toString() ?? "");
  const [priceMax, setPriceMax] = useState(current?.priceMax?.toString() ?? "");
  const [bedroomsMin, setBedroomsMin] = useState(current?.bedroomsMin?.toString() ?? "");
  const [bathroomsMin, setBathroomsMin] = useState(current?.bathroomsMin?.toString() ?? "");
  const [parkingMin, setParkingMin] = useState(current?.parkingMin?.toString() ?? "");
  const [areaMin, setAreaMin] = useState(current?.areaMin?.toString() ?? "");
  const [areaMax, setAreaMax] = useState(current?.areaMax?.toString() ?? "");
  const [furnished, setFurnished] = useState<boolean>(current?.furnished === true);
  const [features, setFeatures] = useState(current?.features.join(", ") ?? "");
  const [restrictions, setRestrictions] = useState(current?.restrictions ?? "");
  const [rangeError, setRangeError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (dto: UpsertLeadPreferenceDto) => saveLeadPreferences(leadId, dto),
    onSuccess: (pref) => {
      queryClient.setQueryData(["lead-preferences", leadId], pref);
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      onSaved?.(pref);
      onClose();
    },
  });

  const lista = (texto: string): string[] | undefined => {
    const itens = texto
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return itens.length > 0 ? itens : undefined;
  };
  const numero = (texto: string): number | undefined => {
    if (!texto.trim()) return undefined;
    const n = Number(texto.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  };

  const submit = () => {
    const dto: UpsertLeadPreferenceDto = {
      purpose: purpose || undefined,
      types: lista(types),
      cities: lista(cities),
      neighborhoods: lista(neighborhoods),
      priceMin: numero(priceMin),
      priceMax: numero(priceMax),
      bedroomsMin: numero(bedroomsMin),
      bathroomsMin: numero(bathroomsMin),
      parkingMin: numero(parkingMin),
      areaMin: numero(areaMin),
      areaMax: numero(areaMax),
      furnished: furnished ? true : undefined,
      features: lista(features),
      restrictions: restrictions.trim() || undefined,
    };
    if (dto.priceMin != null && dto.priceMax != null && dto.priceMin > dto.priceMax) {
      setRangeError("O valor mínimo não pode ser maior que o máximo.");
      return;
    }
    setRangeError(null);
    save.mutate(dto);
  };

  const purposes: { value: PropertyPurpose | ""; label: string }[] = [
    { value: "", label: "Tanto faz" },
    { value: "venda", label: "Compra" },
    { value: "locacao", label: "Locação" },
    { value: "temporada", label: "Temporada" },
  ];

  return (
    <Modal open onClose={onClose} title="O que a lead procura">
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pb-1 pr-0.5">
        <p className="-mt-2 text-body-sm text-text-muted">
          Preencha o que você já sabe da conversa com {leadName}. Tudo é opcional e vira filtro na
          hora de escolher os imóveis.
        </p>

        {save.isError && (
          <Banner variant="danger">Não foi possível salvar agora. Tente novamente.</Banner>
        )}
        {rangeError && <Banner variant="danger">{rangeError}</Banner>}

        {/* Finalidade em segmented control: uma escolha, sempre visível. */}
        <div>
          <span className="text-label text-text">Finalidade</span>
          <div className="mt-1.5 grid grid-cols-4 gap-1 rounded-xl bg-surface-sunken p-1">
            {purposes.map((p) => (
              <button
                key={p.value || "any"}
                type="button"
                aria-pressed={purpose === p.value}
                onClick={() => setPurpose(p.value)}
                className={`rounded-lg px-2 py-1.5 text-caption font-semibold transition-colors duration-fast ${
                  purpose === p.value ? "bg-surface text-text shadow-sm" : "text-text-subtle"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Valor mínimo"
            leading="R$"
            inputMode="numeric"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
          />
          <TextField
            label="Valor máximo"
            leading="R$"
            inputMode="numeric"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
          />
        </div>

        <TextField
          label="Cidades"
          hint="Separe por vírgula"
          value={cities}
          onChange={(e) => setCities(e.target.value)}
          placeholder="São Paulo, Guarulhos"
        />
        <TextField
          label="Bairros"
          hint="Separe por vírgula"
          value={neighborhoods}
          onChange={(e) => setNeighborhoods(e.target.value)}
          placeholder="Moema, Vila Mariana"
        />
        <TextField
          label="Tipos de imóvel"
          hint="Separe por vírgula"
          value={types}
          onChange={(e) => setTypes(e.target.value)}
          placeholder="Apartamento, casa"
        />

        <div className="grid grid-cols-3 gap-3">
          <TextField
            label="Quartos"
            optionalLabel="mín."
            inputMode="numeric"
            value={bedroomsMin}
            onChange={(e) => setBedroomsMin(e.target.value)}
          />
          <TextField
            label="Banheiros"
            optionalLabel="mín."
            inputMode="numeric"
            value={bathroomsMin}
            onChange={(e) => setBathroomsMin(e.target.value)}
          />
          <TextField
            label="Vagas"
            optionalLabel="mín."
            inputMode="numeric"
            value={parkingMin}
            onChange={(e) => setParkingMin(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Metragem mínima"
            optionalLabel="m²"
            inputMode="numeric"
            value={areaMin}
            onChange={(e) => setAreaMin(e.target.value)}
          />
          <TextField
            label="Metragem máxima"
            optionalLabel="m²"
            inputMode="numeric"
            value={areaMax}
            onChange={(e) => setAreaMax(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2.5 text-body-sm text-text">
          <input
            type="checkbox"
            checked={furnished}
            onChange={(e) => setFurnished(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Precisa ser mobiliado
        </label>

        <TextField
          label="Comodidades desejadas"
          hint="Separe por vírgula"
          value={features}
          onChange={(e) => setFeatures(e.target.value)}
          placeholder="Varanda, piscina, pet friendly"
        />

        <div>
          <label className="text-label text-text" htmlFor="pref-restricoes">
            O que a lead não aceita
          </label>
          <textarea
            id="pref-restricoes"
            value={restrictions}
            onChange={(e) => setRestrictions(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Ex.: nada em avenida movimentada, sem escadas"
            className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-body text-text placeholder:text-text-subtle focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        <Button type="button" variant="ghost" fullWidth onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" fullWidth loading={save.isPending} onClick={submit}>
          Salvar preferências
        </Button>
      </div>
    </Modal>
  );
}
