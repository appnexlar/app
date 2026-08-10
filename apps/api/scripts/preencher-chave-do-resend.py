#!/usr/bin/env python3
"""Manda a chave do Resend direto para a Railway, sem passar pela tela.

Mesma prática dos outros scripts: o valor é digitado às escuras e vai para o
destino sem aparecer em lugar nenhum. Aqui o destino é a Railway, e não o
arquivo, porque quem precisa da chave é a API em produção.

Também grava no .env.production, para o arquivo continuar sendo o retrato fiel
do que existe lá, que é o que nos salvou nesta migração.

Uso:  python3 scripts/preencher-chave-do-resend.py
"""

from __future__ import annotations

from getpass import getpass
from pathlib import Path
import re
import subprocess
import sys

ARQUIVO = Path(__file__).resolve().parent.parent / ".env.production"
SERVICO = "@nexlar/api"
REMETENTE = "Nexlar <nao-responda@nexlar.app>"


def main() -> int:
    chave = getpass("Chave do Resend (começa com re_, não aparece): ").strip()
    if not chave:
        print("nada digitado")
        return 1
    if not chave.startswith("re_"):
        print(f"isso não parece uma chave do Resend (esperava começar com 're_')")
        return 1

    # 1) Arquivo local, para o .env.production seguir espelhando a produção.
    texto = ARQUIVO.read_text() if ARQUIVO.exists() else ""
    for nome, valor in (("RESEND_API_KEY", chave), ("EMAIL_FROM", REMETENTE)):
        linha = f'{nome}="{valor}"'
        if re.search(rf"^{nome}=", texto, re.M):
            texto = re.sub(rf"^{nome}=.*$", linha, texto, flags=re.M)
        else:
            texto = texto.rstrip("\n") + f"\n{linha}\n"
    ARQUIVO.write_text(texto)
    ARQUIVO.chmod(0o600)
    print("  .env.production atualizado")

    # 2) Railway, que é quem realmente manda os e-mails.
    r = subprocess.run(
        ["railway", "variables", "--service", SERVICO,
         "--set", f"RESEND_API_KEY={chave}", "--set", f"EMAIL_FROM={REMETENTE}"],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        print("  a Railway recusou:", (r.stderr or r.stdout).strip()[:200])
        return 1
    print(f"  Railway atualizada (remetente: {REMETENTE})")
    print("  a Railway vai republicar sozinha em cerca de um minuto")
    return 0


if __name__ == "__main__":
    sys.exit(main())
