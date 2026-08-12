import { LegalLayout, LegalSection } from "./LegalLayout";

/** Política de Privacidade (RASCUNHO, base LGPD). Substituir pelo texto final. */
export function PrivacyPage() {
  return (
    <LegalLayout title="Política de Privacidade" updatedAt="rascunho">
      <p>
        Esta Política explica como o Nextlar trata dados pessoais, em conformidade
        com a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).
      </p>

      <LegalSection title="1. Dados que coletamos">
        <p>
          Do corretor: nome, e-mail, telefone, número e documento do CRECI,
          estado do registro e, quando aplicável, CPF ou CNPJ. Dos clientes
          cadastrados por você: os dados que você inserir para conduzir o
          atendimento.
        </p>
      </LegalSection>

      <LegalSection title="2. Para que usamos e base legal">
        <p>
          Usamos seus dados para operar o sistema e prestar o serviço contratado
          (base legal: execução de contrato). O documento do CRECI é usado apenas
          para conferência do registro. Não vendemos seus dados.
        </p>
      </LegalSection>

      <LegalSection title="3. Como guardamos">
        <p>
          Documentos sensíveis ficam em armazenamento privado, com acesso
          restrito ao corretor dono. Aplicamos medidas de segurança e retemos os
          dados pelo tempo necessário à finalidade e às obrigações legais.
        </p>
      </LegalSection>

      <LegalSection title="4. Seus direitos como titular">
        <p>
          Você pode solicitar, a qualquer momento: confirmação e acesso aos seus
          dados, correção, exclusão, portabilidade, informação sobre
          compartilhamento e revogação de consentimentos. Pedidos são atendidos
          nos prazos da LGPD.
        </p>
      </LegalSection>

      <LegalSection title="5. Comunicações">
        <p>
          E-mails essenciais do serviço (confirmação de conta, status da
          validação, cobrança) fazem parte da operação. Comunicações de novidades
          e marketing dependem de consentimento específico, que você pode revogar
          quando quiser.
        </p>
      </LegalSection>

      <LegalSection title="6. Encarregado (DPO) e contato">
        <p>
          Para exercer seus direitos ou tirar dúvidas sobre privacidade, fale com
          nosso encarregado pelo tratamento de dados: [contato a definir].
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
