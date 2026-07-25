import { z } from "zod";

export const publicInterestSchema = z.object({
  name: z.string().min(2).max(80),
  whatsapp: z.string().min(10).max(15).regex(/^\d+$/, "Apenas dígitos"),
  message: z.string().max(500).optional(),
  acceptedTerms: z.literal(true),
  honeypot: z.string().max(0).optional(),
});

export type PublicInterest = z.infer<typeof publicInterestSchema>;

export interface CreateInterestRequest {
  name: string;
  whatsapp: string;
  message?: string;
  acceptedTerms: boolean;
}

export interface InterestResponse {
  success: boolean;
  message: string;
}
