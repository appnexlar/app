#!/usr/bin/env python3
"""Escreve as chaves S3 do Storage no .env.production, sem elas irem à tela.

Mesma ideia do preencher-senha-do-banco.py: o valor é digitado às escuras e vai
direto para o arquivo. Aqui tem uma conferência a mais, porque os dois campos
do painel do Supabase ficam lado a lado e trocá-los é o erro mais comum: o ID
tem 32 caracteres e o secret tem 64.

Uso:  python3 scripts/preencher-chaves-do-storage.py
"""

# O Python do macOS ainda é o 3.9, e lá "str | None" na assinatura é avaliado
# em tempo de execução e quebra. Esta linha adia a avaliação das anotações.
from __future__ import annotations

from getpass import getpass
from pathlib import Path
import sys

ARQUIVO = Path(__file__).resolve().parent.parent / ".env.production"
TAMANHO_ID = 32
TAMANHO_SECRET = 64


def pedir(rotulo: str, tamanho: int) -> str | None:
    valor = getpass(f"{rotulo} ({tamanho} caracteres, não aparece): ").strip()
    if not valor:
        print("  nada digitado")
        return None
    if len(valor) != tamanho:
        print(f"  esperava {tamanho} caracteres e vieram {len(valor)}.")
        print("  se os dois campos tiverem 64, você copiou o secret nos dois lugares.")
        return None
    return valor


def main() -> int:
    if not ARQUIVO.exists():
        print(f"não achei {ARQUIVO}")
        return 1

    chave = pedir("Access key ID", TAMANHO_ID)
    if not chave:
        return 1
    segredo = pedir("Secret access key", TAMANHO_SECRET)
    if not segredo:
        return 1

    linhas = []
    trocadas = 0
    for linha in ARQUIVO.read_text().splitlines():
        if linha.startswith("S3_ACCESS_KEY="):
            linha, trocadas = f'S3_ACCESS_KEY="{chave}"', trocadas + 1
        elif linha.startswith("S3_SECRET_KEY="):
            linha, trocadas = f'S3_SECRET_KEY="{segredo}"', trocadas + 1
        linhas.append(linha)

    if trocadas != 2:
        print(f"esperava trocar 2 linhas e troquei {trocadas}: nada foi salvo")
        return 1

    ARQUIVO.write_text("\n".join(linhas) + "\n")
    ARQUIVO.chmod(0o600)
    print("pronto: as duas chaves do Storage foram gravadas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
