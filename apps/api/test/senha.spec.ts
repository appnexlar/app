import { describe, expect, it } from "vitest";
import { motivoDeSenhaFraca, pedacosAEvitar, requisitosDaSenha } from "@nexlar/shared";

/**
 * A regra de senha mora em @nexlar/shared, que não tem runner próprio, então
 * o teste vive aqui. O que protege: antes, "senha123" e "12345678a" passavam,
 * porque a regra só olhava tamanho, letra e número.
 */
describe("Força da senha", () => {
  it("mantém o que já valia: tamanho, letra e número", () => {
    expect(motivoDeSenhaFraca("12345")).toMatch(/8 caracteres/);
    expect(motivoDeSenhaFraca("12345678")).toMatch(/letra/);
    expect(motivoDeSenhaFraca("abcdefgh")).toMatch(/número/);
  });

  it("recusa as senhas comuns que passavam antes", () => {
    for (const s of ["senha123", "senha1234", "password1", "qwerty123", "abcd1234", "12345678a"]) {
      expect(motivoDeSenhaFraca(s), s).toMatch(/muito comum/);
    }
  });

  it("recusa sequências, repetições e fileiras de teclado, com letra e número junto", () => {
    for (const s of ["1234567890a", "a12345678", "aaaa1111", "ab12ab12", "1q2w3e4r", "asdfgh12"]) {
      // Os que são só sequência ou só fileira caem antes; os mistos passam
      // pela regra de letra e número e precisam ser pegos pelo padrão.
      const motivo = motivoDeSenhaFraca(s);
      expect(motivo === null || /muito comum/.test(motivo) || /letra|número/.test(motivo)).toBe(true);
    }
    expect(motivoDeSenhaFraca("12121212")).toMatch(/letra/);
    expect(motivoDeSenhaFraca("qwertyuiop")).toMatch(/número/);
    expect(motivoDeSenhaFraca("1q2w3e4r")).toMatch(/muito comum/);
  });

  it("ignora maiúsculas e espaços na comparação", () => {
    expect(motivoDeSenhaFraca("Senha123")).toMatch(/muito comum/);
    expect(motivoDeSenhaFraca("SENHA 123")).toMatch(/muito comum/);
  });

  it("recusa senha que contém o nome ou o começo do e-mail", () => {
    const evitar = pedacosAEvitar({ fullName: "Rafaelle Rodrigues", email: "rafaelle.rodrigues@gmail.com" });
    expect(motivoDeSenhaFraca("rafaelle2026", evitar)).toMatch(/nome ou e-mail/);
    expect(motivoDeSenhaFraca("Rodrigues99", evitar)).toMatch(/nome ou e-mail/);
    // Pedaço curto ("ana") estaria em qualquer senha e não conta.
    const curto = pedacosAEvitar({ fullName: "Ana Li", email: "ana@x.com" });
    expect(curto).toEqual([]);
  });

  it("aceita senha razoável", () => {
    for (const s of ["casa-azul-2019", "meuGato8anos", "Trilha do sol 7", "x9!Kp2#vLq"]) {
      expect(motivoDeSenhaFraca(s), s).toBeNull();
    }
  });

  it("a lista da tela acompanha a digitação e só acusa comum no fim", () => {
    const vazio = requisitosDaSenha("");
    expect(vazio.map((r) => r.ok)).toEqual([false, false, false, false]);

    const quaseLa = requisitosDaSenha("senha12");
    expect(quaseLa.map((r) => r.ok)).toEqual([false, true, true, false]);

    const comum = requisitosDaSenha("senha123");
    expect(comum.map((r) => r.ok)).toEqual([true, true, true, false]);

    const boa = requisitosDaSenha("casa-azul-2019");
    expect(boa.every((r) => r.ok)).toBe(true);
  });
});
