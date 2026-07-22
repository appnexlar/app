import { BadRequestException, PipeTransform } from "@nestjs/common";
import { ZodType, ZodTypeDef } from "zod";

/**
 * Valida o corpo/parâmetro contra um schema Zod (o mesmo usado no front,
 * via @nexlar/shared). Erros voltam padronizados por campo.
 * Uso: @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto
 */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const fieldErrors = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      throw new BadRequestException({
        message: "Dados inválidos",
        errors: fieldErrors,
      });
    }
    return result.data;
  }
}
