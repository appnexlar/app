import { Global, Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ConsoleEmailService, EmailService } from "./email.service";
import { ResendEmailService } from "./resend-email.service";

/**
 * O driver é escolhido pela presença da RESEND_API_KEY: com chave, envia de
 * verdade; sem chave, escreve no log. Assim o ambiente local funciona sem
 * ninguém precisar de conta no Resend, e produção não depende de lembrar de
 * mudar uma segunda variável de "modo".
 */
@Global()
@Module({
  providers: [
    {
      provide: EmailService,
      inject: [ConfigService],
      useFactory: (config: ConfigService): EmailService => {
        const logger = new Logger("EmailService");
        const temChave = Boolean(config.get<string>("RESEND_API_KEY"));

        if (!temChave) {
          const aviso =
            "RESEND_API_KEY ausente: os e-mails vão só para o log, ninguém recebe nada.";
          // Em produção isto significa recuperação de senha quebrada na prática,
          // então não pode passar como uma linha comum de log.
          if (config.get<string>("NODE_ENV") === "production") logger.error(aviso);
          else logger.log(aviso);
          return new ConsoleEmailService();
        }

        return new ResendEmailService(config);
      },
    },
  ],
  exports: [EmailService],
})
export class EmailModule {}
