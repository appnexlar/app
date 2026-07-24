import { Injectable } from "@nestjs/common";
import type { HelpContent } from "@nexlar/shared";

/**
 * Conteúdo da central de ajuda contextual (§17), estático e por rota.
 *
 * A chave é o primeiro segmento da rota (leads, imoveis, agenda...). Conteúdo
 * genérico e não sensível: nada de dado de lead ou cliente aqui. A arquitetura
 * já é por rota para, mais tarde, receber busca, vídeos ou um assistente de IA
 * sem quebrar o contrato.
 */
const CONTEUDO: Record<string, HelpContent> = {
  dashboard: {
    route: "dashboard",
    title: "Sua central do dia",
    topics: [
      {
        question: "O que aparece aqui?",
        answer:
          "A próxima ação mais importante em destaque, seu progresso nos primeiros passos e um resumo do funil. A Nexlar aponta o que fazer agora, você não precisa procurar.",
      },
      {
        question: "Por que uma orientação some?",
        answer:
          "Quando você conclui a ação de verdade (cadastra o lead, envia o imóvel), a orientação correspondente é marcada como feita e dá lugar à próxima.",
      },
    ],
  },
  leads: {
    route: "leads",
    title: "Ajuda sobre leads",
    topics: [
      {
        question: "O que é um lead?",
        answer:
          "Uma pessoa que demonstrou interesse nos seus imóveis ou serviços. É o ponto de partida de todo atendimento na Nexlar.",
      },
      {
        question: "Como cadastrar rápido?",
        answer:
          "No botão Novo lead. Só o nome e o WhatsApp são obrigatórios; região, intenção e faixa de preço podem entrar depois.",
      },
      {
        question: "Para que servem as preferências?",
        answer:
          "Com região, intenção e faixa de preço, fica mais fácil encontrar imóveis compatíveis e enviar seleções certeiras para cada lead.",
      },
    ],
  },
  imoveis: {
    route: "imoveis",
    title: "Ajuda sobre imóveis",
    topics: [
      {
        question: "Como cadastrar um imóvel?",
        answer:
          "Em Cadastrar imóvel. Comece pelas informações essenciais; fotos, vídeos e detalhes adicionais podem ser adicionados depois.",
      },
      {
        question: "Quais dados são obrigatórios?",
        answer:
          "O mínimo para identificar o imóvel: título, finalidade e categoria. O resto é opcional e você completa quando tiver.",
      },
      {
        question: "Como compartilhar com um lead?",
        answer:
          "Na página do imóvel ou da lead, use Enviar imóvel. A Nexlar cria um link exclusivo, e você acompanha visualizações e manifestações de interesse.",
      },
    ],
  },
  agenda: {
    route: "agenda",
    title: "Ajuda sobre a agenda",
    topics: [
      {
        question: "Para que serve a agenda?",
        answer:
          "Reúne suas tarefas, compromissos e visitas num só lugar, para nada importante passar batido.",
      },
      {
        question: "Como agendar uma visita?",
        answer:
          "Crie um evento do tipo visita e relacione a lead e o imóvel. Assim a visita fica ligada ao atendimento e à timeline da lead.",
      },
    ],
  },
  clientes: {
    route: "clientes",
    title: "Ajuda sobre clientes",
    topics: [
      {
        question: "Qual a diferença entre lead e cliente?",
        answer:
          "É a mesma pessoa em momentos diferentes: o lead vira cliente quando você faz a conversão consciente, sem duplicar o cadastro nem perder o histórico.",
      },
      {
        question: "Quando converter?",
        answer:
          "Quando o atendimento avança de verdade: proposta, documentação ou financiamento em andamento. A conversão é uma ação sua, nunca automática.",
      },
    ],
  },
  funil: {
    route: "funil",
    title: "Ajuda sobre o funil",
    topics: [
      {
        question: "Como o funil funciona?",
        answer:
          "Cada lead ocupa uma etapa da jornada comercial. Muitas etapas avançam sozinhas conforme você age (envia imóvel, registra resposta), e você também pode mover manualmente.",
      },
    ],
  },
};

@Injectable()
export class HelpContentService {
  /** Ajuda da rota, ou null quando aquela tela ainda não tem conteúdo. */
  getForRoute(route: string): HelpContent | null {
    const chave = route.trim().toLowerCase();
    return CONTEUDO[chave] ?? null;
  }
}
