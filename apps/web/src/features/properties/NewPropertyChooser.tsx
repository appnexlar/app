import { ChevronRight, Link2, PencilLine } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../../components/ui/Modal";

/**
 * Porta de entrada do cadastro de imóvel: importar por link ou preencher à
 * mão. A escolha existe para o corretor descobrir que colar um link basta;
 * o cadastro manual continua exatamente onde sempre esteve.
 */
export function NewPropertyChooser({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  return (
    <Modal open={open} onClose={onClose} title="Como você quer cadastrar?">
      <div className="flex flex-col gap-2">
        <Option
          icon={Link2}
          title="Importar por link"
          description="Cole o link de um anúncio e o imóvel chega preenchido para você revisar."
          onClick={() => go("/imoveis/importar")}
        />
        <Option
          icon={PencilLine}
          title="Cadastrar manualmente"
          description="Preencha o cadastro em etapas, no seu ritmo."
          onClick={() => go("/imoveis/novo")}
        />
      </div>
    </Modal>
  );
}

function Option({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[var(--tap-target-min)] items-center gap-4 rounded-xl border border-border bg-surface px-4 py-4 text-left transition-colors duration-fast hover:border-border-strong hover:bg-surface-sunken active:scale-[0.99] focus-visible:shadow-focus"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold text-text">{title}</span>
        <span className="mt-1 block text-body-sm text-text-muted">{description}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-text-subtle" aria-hidden="true" />
    </button>
  );
}
