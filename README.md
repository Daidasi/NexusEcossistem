# NexusEcossistem
NexusEcosystem is a modular AI collaboration platform connecting multiple AI providers, user accounts, autonomous agents, and shared memories through a unified and secure ecosystem.

## NexusBridge v0.1

Implementação de beta privada: Next.js/React/TypeScript, PostgreSQL, salas com usuários independentes, histórico persistente, adaptadores oficiais OpenAI/Anthropic/Gemini e memória com compartilhamento explícito.

**Estado:** código funcional em revisão. As APIs dos provedores ainda precisam ser validadas com credenciais do titular. Não confundir os testes com adaptadores simulados com respostas reais. Não é recomendada publicação aberta: a autenticação inicial usa contas locais sem verificação de e-mail, recuperação ou MFA.

### Executar sem serviços externos

Requer Node.js 24 e npm.

```sh
npm ci
npm run dev
```

Abra a URL indicada no terminal. Na ausência de `.env.local` e `DATABASE_URL`, o comando cria uma chave de criptografia local e um PostgreSQL embarcado (PGlite) persistente em `.data/nexus`. Ambos são ignorados pelo Git. Não existe login, sala, mensagem ou IA de demonstração pré-carregada. Crie sua conta e uma sala. Nenhum provedor recebe pedidos até você conectar uma chave e selecionar agentes.

### PostgreSQL e execução de produção restrita

Configure `DATABASE_URL`, `APP_ORIGIN` e `NEXUS_ENCRYPTION_KEY` no ambiente. Use `NEXUS_REGISTRATION_CODE` para restringir o cadastro. `.env.example` lista apenas os nomes, sem segredos. Para gerar a chave, use um gerador criptográfico de 32 bytes e guarde sua representação base64 em um gerenciador de segredos. Ela precisa permanecer estável entre reinícios; perdê-la torna as credenciais armazenadas irrecuperáveis.

```sh
npm ci
npm run db:migrate
npm run build
npm start
```

Os scripts `db:migrate` e `db:cleanup` leem variáveis do processo. Para usar um arquivo local: `node --env-file=.env.local --import tsx scripts/migrate.ts`.

Com Docker, configure `NEXUS_DB_PASSWORD` (sem caracteres reservados de URL, ou forneça uma URL codificada), `APP_ORIGIN`, `NEXUS_ENCRYPTION_KEY` e `NEXUS_REGISTRATION_CODE`:

```sh
docker compose up -d db
docker compose build app
docker compose run --rm app npm run db:migrate
docker compose up -d app
```

O app fica ligado apenas a `127.0.0.1:3000`. Para hospedagem, use proxy HTTPS, banco privado, cópias de segurança e secrets gerenciados. `APP_ORIGIN` deve corresponder exatamente à origem pública (sem barra final). Não exponha a porta PostgreSQL. O contêiner foi preparado, mas sua execução não foi validada neste ambiente.

### Usar a ponte

1. Crie uma conta e uma sala. Uma sala pode pertencer a um projeto criado por você.
2. Em **Conexões**, cadastre cada chave oficial, proprietário, nome, modelo, tarifas e limites. Duas conexões do mesmo provedor permanecem independentes.
3. **Consultar modelos** faz uma chamada real de listagem; não é evidência de geração de texto. IDs disponíveis dependem da credencial. A troca de modelo exige tarifas atualizadas.
4. **Usar nesta sala** exige autorizar o escopo e escolher “só eu” ou “participantes”. O administrador pode fornecer a própria conexão com orçamento compartilhado. A cobrança real continua na conta que emitiu a chave; não há transferência de pagamento entre pessoas.
5. Convide outra pessoa pelo e-mail da conta Nexus. Compartilhe o código fora do app. Ela usa **Entrar com convite**. Sem envio automático de e-mail.
6. Selecione agentes, mencione pelo botão `@` ou use até três rodadas coordenadas. Sem agentes selecionados, a mensagem é uma mensagem humana persistente.
7. Crie memórias privadas (padrão), de sala ou projeto. Somente memórias compartilhadas com permissão explícita para a conexão podem entrar no contexto. A recuperação inicial é lexical, com limite de bytes conservador para tokens; não há serviço de embeddings.
8. Importe TXT/MD ou JSON compatível e revise antes de confirmar. Exporte suas memórias, corrija conteúdo, revogue agentes ou exclua a memória. Versões anteriores acompanham a exportação enquanto a memória existe.

### Verificações reproduzíveis

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm audit --audit-level=moderate
```

`npm test` usa PostgreSQL embarcado por padrão; `NEXUS_TEST_DATABASE_URL` executa a suíte em um PostgreSQL dedicado. **Nunca use banco de produção em testes.**

Com um servidor já iniciado:

```sh
NEXUS_E2E_URL=http://127.0.0.1:3000 npm run test:http
npx playwright install chromium
NEXUS_E2E_URL=http://127.0.0.1:3000 npm run test:browser
```

O CI usa PostgreSQL em serviço separado, servidor Next de produção e navegadores desktop/mobile. Testes de browser só usam dados sintéticos e não enviam chaves a provedores. O teste físico no Chrome do Galaxy A06 deve ser registrado separadamente.

Consulte [arquitetura](docs/ARCHITECTURE.md), [segurança e limites](docs/SECURITY.md), [validação e pendências](docs/VALIDATION.md) e [roteiro de APIs reais](docs/LIVE_API_CHECKS.md).
