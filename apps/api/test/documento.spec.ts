import { describe, expect, it } from "vitest";
import { isValidCnpj, isValidCpf } from "@nexlar/shared";

/**
 * A validação de documento mora em @nexlar/shared, que não tem runner próprio,
 * então o teste vive aqui junto com o resto da suíte.
 *
 * O que este arquivo protege: antes, CPF e CNPJ só conferiam a quantidade de
 * dígitos, e qualquer número inventado de onze dígitos entrava na ficha do
 * cliente. Erro que só aparecia lá no financiamento.
 */
describe("Validação de CPF e CNPJ", () => {
  it("aceita CPF válido, com ou sem máscara", () => {
    for (const cpf of ["390.533.447-05", "39053344705", "529.982.247-25"]) {
      expect(isValidCpf(cpf)).toBe(true);
    }
  });

  it("recusa os inventados que passavam antes", () => {
    // Todos têm onze dígitos, que era a única regra até então.
    for (const cpf of ["11111111111", "00000000000", "12345678901", "99999999999"]) {
      expect(isValidCpf(cpf)).toBe(false);
    }
  });

  it("recusa CPF com dígito verificador errado", () => {
    // Um dígito trocado no fim de um CPF válido.
    expect(isValidCpf("39053344706")).toBe(false);
  });

  it("recusa tamanho errado e texto", () => {
    for (const cpf of ["", "1234567890", "123456789012", "abcdefghijk"]) {
      expect(isValidCpf(cpf)).toBe(false);
    }
  });

  it("aceita CNPJ válido e recusa inventado", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(isValidCnpj("11111111111111")).toBe(false);
    expect(isValidCnpj("12345678901234")).toBe(false);
  });
});
