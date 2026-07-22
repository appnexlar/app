import { LegalLayout, LegalSection } from "./LegalLayout";

/** Termos de Uso (RASCUNHO). Substituir pelo texto jurídico final. */
export function TermsPage() {
  return (
    <LegalLayout title="Termos de Uso" updatedAt="rascunho">
      <p>
        Estes Termos regem o uso do Nexlar, sistema de gestão para corretores de
        imóveis. Ao criar uma conta, você concorda com as condições abaixo.
      </p>

      <LegalSection title="1. A conta e o cadastro">
        <p>
          Para usar o Nexlar você cria uma conta com dados verdadeiros e mantém
          suas credenciais em sigilo. Criar a conta não significa que seu
          registro profissional (CRECI) está validado: a validação é uma etapa
          separada, feita após conferência.
        </p>
      </LegalSection>

      <LegalSection title="2. Validação do CRECI">
        <p>
          O número e o documento do CRECI informados passam por conferência. O
          selo de corretor validado só é atribuído após aprovação. Informações
          falsas podem levar à recusa e ao encerramento da conta.
        </p>
      </LegalSection>

      <LegalSection title="3. Uso responsável">
        <p>
          Você é responsável pelos dados que cadastra sobre seus clientes e por
          ter autorização para tratá-los, conforme a Política de Privacidade e a
          legislação aplicável (LGPD).
        </p>
      </LegalSection>

      <LegalSection title="4. Planos e pagamento">
        <p>
          Os planos e valores são apresentados no cadastro. Não há fidelidade e o
          cancelamento pode ser feito a qualquer momento.
        </p>
      </LegalSection>

      <LegalSection title="5. Encerramento">
        <p>
          Você pode encerrar sua conta quando quiser. Podemos suspender contas
          que violem estes Termos.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
