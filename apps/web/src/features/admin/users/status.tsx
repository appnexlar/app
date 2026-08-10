import { BROKER_STATUS_LABELS, type BrokerAccountStatus } from "@nexlar/shared";

export const dataCurta = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

/**
 * Selo de status da conta. "Pendente de verificação" não vem do banco: é a
 * conta ativa que nunca confirmou o e-mail (docs/10, D3), e o selo deriva
 * isso aqui para a lista e o perfil contarem a mesma história.
 */
export function StatusDaConta({
  status,
  emailVerified,
}: {
  status: BrokerAccountStatus;
  emailVerified: boolean;
}) {
  const pendente = status === "ativo" && !emailVerified;
  const rotulo = pendente ? "Pendente de verificação" : BROKER_STATUS_LABELS[status];
  const classes = pendente
    ? "bg-[var(--warning-soft)] text-[var(--warning-fg)]"
    : status === "ativo"
      ? "bg-[var(--success-soft)] text-[var(--success-fg)]"
      : "bg-[var(--danger-soft)] text-[var(--danger-fg)]";

  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ${classes}`}>
      {rotulo}
    </span>
  );
}
