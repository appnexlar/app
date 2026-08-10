#!/usr/bin/env python3
"""Escreve a senha do banco no .env.production, sem ela passar pela tela.

A senha é digitada às escuras (o terminal não mostra, e por isso também não
guarda no histórico) e vai direto para o arquivo. Nenhum agente, nenhum log e
nenhum chat vê o valor. É a mesma prática que adotamos depois do vazamento no
outro projeto.

Uso:  python3 scripts/preencher-senha-do-banco.py
"""

from getpass import getpass
from pathlib import Path
from urllib.parse import quote
import re
import sys

ARQUIVO = Path(__file__).resolve().parent.parent / ".env.production"
MARCADOR = "COLE_A_SENHA_AQUI"


def main() -> int:
    if not ARQUIVO.exists():
        print(f"não achei {ARQUIVO}")
        return 1

    texto = ARQUIVO.read_text()
    alvos = len(re.findall(r"://postgres\.[a-z0-9]+:([^@]+)@", texto))
    if alvos == 0:
        print("nenhuma string de conexão encontrada no arquivo")
        return 1

    senha = getpass("Senha do banco (não aparece enquanto você digita): ")
    if not senha:
        print("nada digitado, arquivo intacto")
        return 1
    if senha != getpass("Digite de novo para conferir: "):
        print("as duas não bateram, arquivo intacto")
        return 1

    # Caractere especial em senha quebra a URL de conexão. O escape aqui é o
    # mesmo que o Supabase pede no aviso amarelo da tela de criação.
    seguro = quote(senha, safe="")
    if seguro != senha:
        print("a senha tem caractere especial: apliquei a codificação da URL")

    novo = re.sub(r"(://postgres\.[a-z0-9]+:)([^@]+)(@)", lambda m: m.group(1) + seguro + m.group(3), texto)
    ARQUIVO.write_text(novo)
    ARQUIVO.chmod(0o600)

    # Só linhas de verdade contam: o cabeçalho explica os marcadores e citá-lo
    # como pendência faria o script mentir sobre o que falta.
    faltando = [
        linha.split("=", 1)[0]
        for linha in novo.splitlines()
        if not linha.startswith("#") and "COLE_" in linha
    ]
    print(f"pronto: {alvos} string(s) de conexão preenchida(s)")
    if faltando:
        print("ainda falta preencher: " + ", ".join(faltando))
    return 0


if __name__ == "__main__":
    sys.exit(main())
