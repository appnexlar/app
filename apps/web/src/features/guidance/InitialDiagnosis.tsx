import { useState } from "react";
import type { BusinessFocus, SaveDiagnosisDto, WorkMode } from "@nexlar/shared";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";

/**
 * Diagnóstico inicial (§6). Curto e opcional: personaliza a priorização das
 * recomendações, mas pode ser pulado inteiro. Nada é obrigatório; cada resposta
 * em branco simplesmente não influencia. Segmentos em vez de campos livres para
 * responder num toque, no celular.
 */
export function InitialDiagnosis({
  open,
  onSave,
  onSkip,
  busy = false,
}: {
  open: boolean;
  onSave: (dto: SaveDiagnosisDto) => void;
  onSkip: () => void;
  busy?: boolean;
}) {
  const [workMode, setWorkMode] = useState<WorkMode | undefined>();
  const [businessFocus, setBusinessFocus] = useState<BusinessFocus | undefined>();
  const [hasLeads, setHasLeads] = useState<boolean | undefined>();
  const [hasProperties, setHasProperties] = useState<boolean | undefined>();

  return (
    <Modal open={open} onClose={onSkip} title="Vamos personalizar sua Nexlar">
      <p className="text-body-sm text-text-muted">
        Três perguntas rápidas para as sugestões nascerem do seu jeito de
        trabalhar. Pode pular qualquer uma.
      </p>

      <div className="mt-5 flex flex-col gap-5">
        <Pergunta titulo="Como você trabalha?">
          <Segmentos
            valor={workMode}
            onEscolher={setWorkMode}
            opcoes={[
              { valor: "sozinho", rotulo: "Por conta própria" },
              { valor: "imobiliaria", rotulo: "Em uma imobiliária" },
            ]}
          />
        </Pergunta>

        <Pergunta titulo="Seu foco principal?">
          <Segmentos
            valor={businessFocus}
            onEscolher={setBusinessFocus}
            opcoes={[
              { valor: "venda", rotulo: "Venda" },
              { valor: "locacao", rotulo: "Locação" },
              { valor: "ambos", rotulo: "Ambos" },
            ]}
          />
        </Pergunta>

        <Pergunta titulo="Você já tem uma carteira de leads?">
          <Segmentos
            valor={hasLeads}
            onEscolher={setHasLeads}
            opcoes={[
              { valor: true, rotulo: "Sim" },
              { valor: false, rotulo: "Ainda não" },
            ]}
          />
        </Pergunta>

        <Pergunta titulo="Já tem imóveis para cadastrar?">
          <Segmentos
            valor={hasProperties}
            onEscolher={setHasProperties}
            opcoes={[
              { valor: true, rotulo: "Sim" },
              { valor: false, rotulo: "Ainda não" },
            ]}
          />
        </Pergunta>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <Button
          type="button"
          variant="accent"
          fullWidth
          loading={busy}
          onClick={() =>
            onSave({
              workMode,
              businessFocus,
              hasExistingLeads: hasLeads,
              hasExistingProperties: hasProperties,
            })
          }
        >
          Salvar e continuar
        </Button>
        <Button type="button" variant="ghost" fullWidth onClick={onSkip} disabled={busy}>
          Pular por agora
        </Button>
      </div>
    </Modal>
  );
}

function Pergunta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-body-sm font-semibold text-text">{titulo}</legend>
      {children}
    </fieldset>
  );
}

/** Grupo de botões de escolha única. Tocar de novo na escolha a desmarca. */
function Segmentos<T extends string | boolean>({
  valor,
  onEscolher,
  opcoes,
}: {
  valor: T | undefined;
  onEscolher: (v: T | undefined) => void;
  opcoes: { valor: T; rotulo: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {opcoes.map((opt) => {
        const ativo = valor === opt.valor;
        return (
          <button
            key={String(opt.valor)}
            type="button"
            aria-pressed={ativo}
            onClick={() => onEscolher(ativo ? undefined : opt.valor)}
            className={
              "rounded-xl border px-3.5 py-2 text-body-sm font-semibold transition-colors focus-visible:shadow-focus " +
              (ativo
                ? "border-accent bg-accent text-accent-on"
                : "border-border bg-surface text-text hover:border-border-strong")
            }
          >
            {opt.rotulo}
          </button>
        );
      })}
    </div>
  );
}
