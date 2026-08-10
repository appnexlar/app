#!/usr/bin/env python3
"""Manda a credencial do Google para a Railway e para o .env local, às escuras.

Mesma prática dos outros scripts desta pasta: o valor é digitado sem aparecer na
tela, e por isso não entra no histórico do terminal nem em chat nenhum.

O Client ID não é segredo (ele viaja na URL do Google, à vista de todo mundo),
mas o Secret é. Pedimos os dois do mesmo jeito para não haver dúvida sobre qual
pode ser colado onde.

As duas variáveis andam juntas: a API recusa subir com só uma delas. Por isso
este script grava as duas ou nenhuma.

Uso:  python3 scripts/preencher-credencial-do-google.py
      python3 scripts/preencher-credencial-do-google.py --local
"""

from __future__ import annotations

from getpass import getpass
from pathlib import Path
import re
import subprocess
import sys

RAIZ = Path(__file__).resolve().parent.parent
SERVICO = "@nexlar/api"


def pedir_credencial() -> tuple[str, str] | None:
    client_id = getpass("Client ID (termina em .apps.googleusercontent.com): ").strip()
    if not client_id:
        print("  nada digitado")
        return None
    # O Google sempre entrega o ID com esse sufixo. Conferir aqui evita o erro
    # mais provável, que é colar o Secret nos dois campos sem perceber.
    if not client_id.endswith(".apps.googleusercontent.com"):
        print("  isso não parece um Client ID: ele termina em .apps.googleusercontent.com")
        return None

    client_secret = getpass("Client Secret (começa com GOCSPX-): ").strip()
    if not client_secret:
        print("  nada digitado")
        return None
    if client_secret == client_id:
        print("  você colou o mesmo valor nos dois campos")
        return None
    # A tela do Google mostra o secret mascarado ("****9Vpr"). Selecionar esse
    # texto com o mouse copia a máscara, e o Google recusa depois com
    # invalid_client. Aconteceu na primeira tentativa, em 9 ago 2026.
    if client_secret.startswith("*") or not client_secret.startswith("GOCSPX-"):
        print("  isso não é o Client Secret: ele começa com 'GOCSPX-'.")
        print("  se veio com asteriscos, você copiou a máscara da tela.")
        print("  use o ícone de copiar ao lado do valor, não o mouse.")
        return None
    return client_id, client_secret


def gravar_no_arquivo(arquivo: Path, valores: dict[str, str]) -> None:
    texto = arquivo.read_text() if arquivo.exists() else ""
    for nome, valor in valores.items():
        linha = f'{nome}="{valor}"'
        if re.search(rf"^{nome}=", texto, re.M):
            texto = re.sub(rf"^{nome}=.*$", linha, texto, flags=re.M)
        else:
            texto = texto.rstrip("\n") + f"\n{linha}\n"
    arquivo.write_text(texto)
    arquivo.chmod(0o600)
    print(f"  {arquivo.name} atualizado")


def main() -> int:
    local = "--local" in sys.argv
    destino = "ambiente local" if local else "produção"
    print(f"Credencial do Google para {destino}.")
    print("Clique dentro desta janela antes de colar: o campo não mostra nada.\n")

    credencial = pedir_credencial()
    if not credencial:
        return 1
    client_id, client_secret = credencial
    valores = {"GOOGLE_CLIENT_ID": client_id, "GOOGLE_CLIENT_SECRET": client_secret}

    if local:
        gravar_no_arquivo(RAIZ / ".env", valores)
        print("\n  reinicie a API e confira com:")
        print("  curl -si http://localhost:3333/api/auth/google | head -1")
        return 0

    # O .env.production é o retrato do que existe lá fora, e foi ele que nos
    # salvou na migração de conta. Mantemos os dois em dia.
    gravar_no_arquivo(RAIZ / ".env.production", valores)

    r = subprocess.run(
        ["railway", "variables", "--service", SERVICO,
         "--set", f"GOOGLE_CLIENT_ID={client_id}",
         "--set", f"GOOGLE_CLIENT_SECRET={client_secret}"],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        print("  a Railway recusou:", (r.stderr or r.stdout).strip()[:300])
        return 1
    print("  Railway atualizada")
    print("  ela republica sozinha em cerca de um minuto; depois confira com:")
    print("  curl -s https://nexlar.app/api/auth/providers")
    return 0


if __name__ == "__main__":
    sys.exit(main())
