import type {
  FinancingPublicForm,
  FinancingPublicState,
  FinancingSaveSectionDto,
  FinancingSubmitResult,
} from "@nexlar/shared";

/**
 * O formulário do cliente: fetch direto, sem Authorization, porque quem
 * preenche nunca fez login. A sessão é o cookie httpOnly que o navegador
 * carrega sozinho (mesma origem via proxy/rewrite).
 */

export class PublicFinancingError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function chamar<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/public/financiamento${path}`, {
      ...init,
      // Content-Type só quando há corpo: o Fastify recusa, com razão, um
      // "application/json" vazio (o POST do código não manda nada).
      headers: init?.body
        ? { "Content-Type": "application/json", ...init?.headers }
        : init?.headers,
    });
  } catch {
    throw new PublicFinancingError(0, "Sem conexão. Verifique a internet e tente de novo.");
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const mensagem =
      (body && typeof body.message === "string" && body.message) ||
      "Não foi possível continuar agora. Tente novamente.";
    throw new PublicFinancingError(response.status, mensagem);
  }
  return body as T;
}

export function fetchFinancingState(token: string): Promise<FinancingPublicState> {
  return chamar<FinancingPublicState>(`/${encodeURIComponent(token)}`);
}

export function requestFinancingCode(token: string): Promise<void> {
  return chamar<void>(`/${encodeURIComponent(token)}/otp`, { method: "POST" });
}

export function verifyFinancingCode(token: string, code: string): Promise<FinancingPublicForm> {
  return chamar<FinancingPublicForm>(`/${encodeURIComponent(token)}/verify`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function fetchFinancingForm(token: string): Promise<FinancingPublicForm> {
  return chamar<FinancingPublicForm>(`/${encodeURIComponent(token)}/form`);
}

export function saveFinancingSection(
  token: string,
  dto: FinancingSaveSectionDto,
): Promise<FinancingPublicForm> {
  return chamar<FinancingPublicForm>(`/${encodeURIComponent(token)}/form`, {
    method: "PATCH",
    body: JSON.stringify(dto),
  });
}

export function submitFinancing(token: string): Promise<FinancingSubmitResult> {
  return chamar<FinancingSubmitResult>(`/${encodeURIComponent(token)}/submit`, {
    method: "POST",
    body: JSON.stringify({ consent: true }),
  });
}
