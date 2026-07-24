import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";

/**
 * Recepção de primeiro acesso (§5). Curta e não obrigatória: as duas ações
 * levam ao sistema. "Começar" abre o diagnóstico; "Explorar" pula direto, sem
 * desligar as orientações contextuais. Nada aqui bloqueia o uso.
 */
export function FirstAccessWelcome({
  open,
  onStart,
  onExplore,
  busy = false,
}: {
  open: boolean;
  onStart: () => void;
  onExplore: () => void;
  busy?: boolean;
}) {
  return (
    <Modal open={open} onClose={onExplore} title="Bem-vindo à Nexlar">
      <div className="flex flex-col items-center text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 2.5l1.9 5.4a2 2 0 001.2 1.2l5.4 1.9-5.4 1.9a2 2 0 00-1.2 1.2L12 19.5l-1.9-5.4a2 2 0 00-1.2-1.2L3.5 11l5.4-1.9a2 2 0 001.2-1.2L12 2.5z"
              fill="currentColor"
            />
          </svg>
        </span>
        <p className="mt-5 max-w-xs text-body text-text-muted">
          Você não precisa aprender tudo agora. A Nexlar vai apresentar cada
          recurso no momento em que ele puder ajudar sua operação.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <Button type="button" variant="accent" fullWidth onClick={onStart} loading={busy}>
          Começar
        </Button>
        <Button type="button" variant="ghost" fullWidth onClick={onExplore} disabled={busy}>
          Explorar o sistema
        </Button>
      </div>
    </Modal>
  );
}
