# Validação da NexusBridge v0.1 — 2026-11-06

Repositório privado: `Daidasi/NexusEcossistem`. Branch: `feat/nexusbridge-v0.1`. PR: https://github.com/Daidasi/NexusEcossistem/pull/1 (draft; sem merge). `main` e outros projetos preservados.

## Execução comprovada

| Verificação | Resultado |
|---|---|
| `npm ci` | Aprovada localmente e no CI |
| ESLint / TypeScript | Aprovados |
| Build Next de produção | Aprovado |
| Segurança/integração | 26 testes aprovados em PGlite e no PostgreSQL 17.11 do CI |
| PostgreSQL nativo local | Suíte inicial de 18 testes aprovada em PostgreSQL 18.6 |
| Contratos dos SDKs oficiais | 4 testes adicionais aprovados localmente com fixtures HTTP; nenhuma API real usada |
| HTTP end-to-end | 2 testes aprovados contra Next de produção e PostgreSQL no CI |
| Browser desktop / layout Android | 2 testes aprovados no Chromium do CI |
| Auditoria de dependências | Zero vulnerabilidades após override direcionado de minimatch 11.0.5 |
| Inspeção visual | Tela real de entrada conferida no navegador do Work |

CI completo aprovado para o commit `1ce34daf07ca572482ba403655e8ca657961c30f`: https://github.com/Daidasi/NexusEcossistem/actions/runs/42320398960

O checkpoint seguinte acrescenta os quatro testes de contratos dos SDKs e esta consolidação documental. Consulte os checks do PR para o resultado do commit mais recente. O comando padrão `npm test` pula dois testes HTTP quando `NEXUS_E2E_URL` não está definido; no CI eles são executados separadamente com servidor iniciado. Isso não é ocultado como aprovação local.

## Cenários A–H

| Cenário | Evidência atual | O que falta |
|---|---|---|
| A — GPT, Claude e Gemini juntos | Orquestração e atribuição aprovadas com adapters de teste; contratos dos SDKs testados com HTTP simulado | Geração com três APIs reais e credenciais autorizadas |
| B — dois donos, dois GPTs | Credenciais, autoria e consumo separados nos testes | Duas contas de API reais |
| C — memória para duas IAs | Seleção, grants e referências observáveis nos contextos de teste | Respostas de duas APIs reais |
| D — memória privada isolada | Backend adversarial e duas sessões HTTP reais aprovados | Ampliar revisão antes de publicação aberta |
| E — revogação | Testes de revogação e corrida antes do despacho; contexto derivado filtrado; memória pode tornar-se privada | Verificação com provedores reais |
| F — persistência | Reabertura de banco, nova sessão HTTP e reload de página no browser aprovados | Teste na hospedagem definitiva |
| G — falha independente | Uma API simulada falha e outra responde; reserva e auditoria verificadas | Falha/créditos de provedor real |
| H — Android | Fluxo com viewport/touch Android em Chromium passou | Chrome físico do Galaxy A06, incluindo teclado e retrato/paisagem |

Nenhuma chave OpenAI, Anthropic ou Gemini estava configurada. **Nenhuma geração real de IA foi executada.** A aplicação não tem modo de resposta fictícia: simulações são injetadas exclusivamente nos testes.

## Revisão crítica

Foram examinados arquitetura, segurança, privacidade, UX, custos e confiabilidade. A revisão independente encontrou problemas corrigidos com regressões:

- Intenção de envio persiste antes da API; timeout não apaga destinatário, finalidade ou referências de memória.
- Reserva e despacho usam configuração consistente. Mudança de modelo exige tarifas e revalidação; falha anterior ao envio devolve reserva.
- Atualizações concorrentes não restauram credenciais antigas; ciphertext é vinculado a proprietário/conexão.
- Revogação revalida versões no despacho e bloqueia reenvio de respostas derivadas. Tornar privada revoga também a leitura humana.
- Remoção de participante invalida convites antigos não usados. Tipo/ordem de bloqueios revisados e testados no PostgreSQL.
- Importação confirmada é atômica; revisões preservam o original; exportação inclui todas as memórias próprias, além do limite de 200 da UI.
- Drafts expirados têm expurgo; sessões/rate limits têm rotina de limpeza; reservas incertas nunca são liberadas automaticamente.
- Correções de acessibilidade/seletor no browser e reenvio idempotente no mesmo formulário após falha de rede.

A segunda rodada da revisão independente foi interrompida pelo limite de uso do agente depois de entregar achados adicionais; esses achados foram corrigidos e cobertos por testes pelo implementador. Não se alega certificação externa nem nota 9/10 comprovada. A recomendação de merge para produção permanece bloqueada pelos itens abaixo.

## Limitações materiais

- Autenticação local sem verificação de e-mail, recuperação ou MFA. Use beta restrita; identidade gerenciada/verificada antes de publicação aberta.
- Sem demonstração hospedada: PostgreSQL, identidade e secrets de hospedagem não foram provisionados. Docker/Compose preparados, mas execução dos contêineres não testada aqui.
- Sem RLS instalada, embeddings ou sincronização nativa de memórias dos aplicativos consumidores. Fronteira de autorização é o backend; banco deve ser privado.
- UI consulta até 200 itens recentes, sem paginação completa. Estimativas de custo dependem das tarifas informadas; conciliação de chamadas incertas ainda é operacional.
- ESLint 9 está descontinuado pelo fornecedor; o conjunto atual é compatível com eslint-config-next e passa auditoria, mas precisa de acompanhamento de atualização.

A tentativa inicial de HTTP local não alcançou o loopback do preview (ECONNREFUSED). O mesmo teste passou depois no CI com servidor de produção. A primeira rodada de browser falhou por seletores; a rodada corrigida passou. Nenhum desses resultados é apresentado como teste físico Android.

## Próxima verificação externa

Siga `docs/LIVE_API_CHECKS.md`. Cada titular insere sua própria chave na interface usando HTTPS, sem enviar chaves ao chat, GitHub ou logs. Execute A–H e registre modelo, data, respostas, consumo e limitações sem dados secretos.
