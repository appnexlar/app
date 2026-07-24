import type { ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { useAuth } from "./AuthContext";

/**
 * Segura a aplicação enquanto o servidor confere o cookie e diz se há sessão.
 *
 * Sem isto o app renderizaria as rotas antes de saber quem é, e quem está
 * logado veria a tela de login por um instante antes de ser jogado para dentro.
 * Piscar o login para quem já entrou passa a impressão de que a sessão caiu.
 *
 * Este passo existe porque nada fica guardado no navegador: é o preço, pequeno,
 * de não ter credencial nenhuma ao alcance de um script injetado.
 */
export function SessionBoot({ children }: { children: ReactNode }) {
  const { restaurando, falhaDeRede, tentarNovamente } = useAuth();

  if (falhaDeRede) {
    return (
      <Centralizado>
        <Marca />
        <h1 className="mt-6 text-h3 text-text">Sem conexão com o servidor</h1>
        <p className="mt-2 max-w-xs text-body-sm text-text-muted">
          Não conseguimos confirmar sua sessão. Verifique sua internet e tente de
          novo. Você não foi desconectado.
        </p>
        <Button type="button" variant="accent" className="mt-6" onClick={tentarNovamente}>
          Tentar de novo
        </Button>
      </Centralizado>
    );
  }

  if (restaurando) {
    return (
      <Centralizado>
        <Marca />
        <div
          role="status"
          aria-label="Restaurando sua sessão"
          className="mt-8 h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
        />
        {/* Sem texto de "carregando": na maioria das vezes isto dura poucos
            décimos de segundo, e uma frase que aparece e some incomoda mais
            do que ajuda. O rótulo acessível cobre quem usa leitor de tela. */}
      </Centralizado>
    );
  }

  return <>{children}</>;
}

function Centralizado({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-sunken px-6 text-center">
      {children}
    </div>
  );
}

function Marca() {
  return (
    <span className="text-h2 font-bold tracking-tight text-primary">
      nex<span className="text-accent">lar</span>
    </span>
  );
}
