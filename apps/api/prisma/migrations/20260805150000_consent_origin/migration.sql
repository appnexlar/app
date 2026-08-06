-- Coleta de dados para simulação (docs/09, Fatia D): o consentimento passa a
-- registrar de onde veio. Null = registrado pelo corretor no sistema (todo o
-- histórico); "formulario_publico" = aceito pelo próprio cliente no /f/:token.
ALTER TABLE "consent" ADD COLUMN "origin" TEXT;
