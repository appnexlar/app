import type { BrokerProfile, UpdateProfileDto } from "@nexlar/shared";
import { http } from "../../lib/http";

/** Perfil do corretor logado, direto do servidor. */
export function fetchMe(): Promise<BrokerProfile> {
  return http.get<BrokerProfile>("/brokers/me");
}

/** Salva os campos editáveis do perfil e devolve o perfil atualizado. */
export function updateMe(data: UpdateProfileDto): Promise<BrokerProfile> {
  return http.patch<BrokerProfile>("/brokers/me", data);
}
