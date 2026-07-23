import { SetMetadata } from "@nestjs/common";

export const ALLOW_UNVERIFIED_KEY = "allowUnverified";

/**
 * Deixa a rota passar mesmo com o e-mail ainda não confirmado. Serve para o
 * pouco que a pessoa precisa fazer enquanto está presa no gate: ler o próprio
 * perfil e sair da conta. Todo o resto do sistema fica bloqueado até confirmar.
 */
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED_KEY, true);
