/**
 * Força da senha do corretor.
 *
 * A regra segue o que o NIST recomenda hoje: comprimento e comparação com o
 * que é conhecido por ser fraco, em vez de exigir maiúscula e símbolo. Exigir
 * símbolo só troca "senha123" por "Senha123!", igualmente chutável, e faz a
 * pessoa anotar a senha num papel.
 *
 * O que protege de verdade, além disto, é o resto: Argon2id no banco e limite
 * de tentativas no login. Esta regra impede o óbvio, que é o que qualquer
 * ataque tenta primeiro.
 */

export const SENHA_MINIMO = 8;
export const SENHA_MAXIMO = 128;

/**
 * As senhas mais usadas em vazamentos, mais as variações em português que
 * aparecem nas listas brasileiras. Comparadas em minúsculo e sem espaços.
 * Não precisa ser exaustiva: os padrões abaixo pegam as famílias inteiras.
 */
const SENHAS_COMUNS = new Set([
  "12345678", "123456789", "1234567890", "12345678910", "123123123", "112233445566",
  "87654321", "987654321", "0123456789", "11111111", "00000000", "10203040", "01020304",
  "password", "password1", "password123", "passw0rd", "p@ssw0rd", "senha123", "senha1234",
  "senha12345", "senha2024", "senha2025", "senha2026", "minhasenha", "minhasenha1",
  "mudar123", "trocar123", "admin123", "admin1234", "administrador", "master123",
  "qwerty123", "qwertyuiop", "1q2w3e4r", "1q2w3e4r5t", "1qaz2wsx", "zaq12wsx", "asdfghjkl",
  "abcd1234", "abc12345", "abcdefgh", "a1b2c3d4", "a123456789", "aaaaaaaa",
  "iloveyou", "sunshine", "princess", "football", "baseball", "superman", "batman123",
  "letmein1", "welcome1", "welcome123", "monkey123", "dragon123", "shadow123",
  "brasil123", "brasil2026", "flamengo", "flamengo1", "corinthians", "palmeiras", "saopaulo",
  "santos123", "vasco123", "gremio123", "cruzeiro", "atletico", "botafogo", "fluminense",
  "imoveis123", "imovel123", "corretor1", "corretor123", "creci123", "vendas123",
  "nextlar1", "nextlar123", "nextlar2026",
]);

/** Só dígitos em sequência crescente ou decrescente: 12345678, 98765432. */
function ehSequenciaNumerica(s: string): boolean {
  if (!/^\d+$/.test(s)) return false;
  let sobe = true;
  let desce = true;
  for (let i = 1; i < s.length; i++) {
    const d = Number(s[i]) - Number(s[i - 1]);
    if (d !== 1) sobe = false;
    if (d !== -1) desce = false;
  }
  return sobe || desce;
}

/** Uma ou duas coisas repetidas até dar o tamanho: aaaaaaaa, abababab, 12121212. */
function ehRepeticao(s: string): boolean {
  for (const tamanho of [1, 2, 3]) {
    const bloco = s.slice(0, tamanho);
    if (bloco.repeat(Math.ceil(s.length / tamanho)).slice(0, s.length) === s) return true;
  }
  return false;
}

/** Fileira do teclado, para a frente ou para trás: qwertyui, asdfghjk, 1234qwer. */
const FILEIRAS = ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
function ehFileiraDeTeclado(s: string): boolean {
  const alvo = s.toLowerCase();
  for (const fileira of FILEIRAS) {
    const ida = fileira;
    const volta = [...fileira].reverse().join("");
    if (ida.includes(alvo) || volta.includes(alvo)) return true;
  }
  return false;
}

/**
 * Um trecho longo e previsível dentro da senha já a entrega: "12345678a" não é
 * uma sequência pura, mas oito dígitos em sequência com uma letra colada
 * continuam sendo a primeira coisa que se tenta. Vale a partir de seis.
 */
const TRECHO_MINIMO = 6;
function temTrechoPrevisivel(s: string): boolean {
  for (const trecho of s.match(/\d+|[a-z]+/g) ?? []) {
    if (trecho.length < TRECHO_MINIMO) continue;
    if (ehSequenciaNumerica(trecho) || ehRepeticao(trecho) || ehFileiraDeTeclado(trecho)) return true;
  }
  return false;
}

/**
 * Por que a senha é fraca, ou null se serve. A mensagem é a que a pessoa vê.
 *
 * `evitar` são pedaços que não podem estar dentro da senha: o nome e o
 * começo do e-mail de quem está se cadastrando. "rafaelle2026" não é senha.
 */
export function motivoDeSenhaFraca(senha: string, evitar: string[] = []): string | null {
  if (senha.length < SENHA_MINIMO) return `A senha precisa de pelo menos ${SENHA_MINIMO} caracteres`;
  if (senha.length > SENHA_MAXIMO) return "A senha é longa demais";
  if (!/[A-Za-z]/.test(senha)) return "Inclua ao menos uma letra";
  if (!/[0-9]/.test(senha)) return "Inclua ao menos um número";

  const normalizada = senha.toLowerCase().replace(/\s+/g, "");
  if (
    SENHAS_COMUNS.has(normalizada) ||
    ehSequenciaNumerica(normalizada) ||
    ehRepeticao(normalizada) ||
    ehFileiraDeTeclado(normalizada) ||
    temTrechoPrevisivel(normalizada)
  ) {
    return "Essa senha é muito comum. Escolha outra.";
  }

  for (const pedaco of evitar) {
    const p = pedaco.toLowerCase().trim();
    // Pedaço curto demais estaria em qualquer senha ("ana" em "banana").
    if (p.length >= 4 && normalizada.includes(p)) {
      return "A senha não pode conter seu nome ou e-mail.";
    }
  }
  return null;
}

/** Pedaços do nome e do e-mail que a senha não pode conter. */
export function pedacosAEvitar(dados: { fullName?: string; email?: string }): string[] {
  const pedacos: string[] = [];
  if (dados.email) pedacos.push(dados.email.split("@")[0]);
  if (dados.fullName) pedacos.push(...dados.fullName.split(/\s+/));
  return pedacos.filter((p) => p.length >= 4);
}

export interface RequisitoDaSenha {
  rotulo: string;
  ok: boolean;
}

/**
 * A lista que a tela mostra enquanto a pessoa digita. Cada item vira verde
 * conforme é atendido, e "muito comum" só é avaliado depois dos outros, para
 * a lista não acusar uma senha de comum antes de ela existir.
 */
export function requisitosDaSenha(senha: string, evitar: string[] = []): RequisitoDaSenha[] {
  const basicos: RequisitoDaSenha[] = [
    { rotulo: `Pelo menos ${SENHA_MINIMO} caracteres`, ok: senha.length >= SENHA_MINIMO },
    { rotulo: "Uma letra", ok: /[A-Za-z]/.test(senha) },
    { rotulo: "Um número", ok: /[0-9]/.test(senha) },
  ];
  const basicosOk = basicos.every((r) => r.ok);
  const motivo = basicosOk ? motivoDeSenhaFraca(senha, evitar) : null;
  return [
    ...basicos,
    { rotulo: "Não ser uma senha comum nem conter seu nome", ok: basicosOk && motivo === null },
  ];
}
