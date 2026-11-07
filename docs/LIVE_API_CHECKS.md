# Verificação real A–H

Nenhuma chave OpenAI, Anthropic ou Gemini estava configurada no ambiente de implementação. Nenhuma geração real foi executada. SDKs oficiais são usados no backend; simuladores existem exclusivamente na suíte de testes.

## Preparação

Use banco dedicado para a beta, HTTPS e contas de teste identificadas. Cada titular insere sua própria chave pela UI. Escolha modelos realmente disponíveis e confirme tarifas na documentação oficial. Use limites pequenos na Nexus e no provedor. Nunca coloque chaves neste documento, no chat do assistente ou no PR.

| Cenário | Execução e evidência a coletar |
|---|---|
| A | Mesmo usuário cadastra 3 conexões oficiais, consulta modelos, anexa à sala e seleciona todas; registrar 3 respostas, IDs e usage sem credenciais |
| B | Dois usuários separados cadastram 2 conexões OpenAI; convite pessoal, autorizações e respostas atribuídas a seus donos; conferir ledger de cada conexão |
| C | Criar memória de sala com marcador sintético; permitir 2 conexões; pedir explicitamente pelo assunto; conferir referências e auditoria dos dois destinatários |
| D | Criar marcador privado; outro usuário não o encontra no snapshot, exportação própria ou contexto dos agentes |
| E | Revogar memória; fazer novo pedido, confirmar ausência do marcador e de versões revogadas no novo contexto/auditoria, incluindo respostas antigas derivadas |
| F | Recarregar, sair e entrar; conferir mensagens persistentes. Usuário fora da sala recebe negação |
| G | Uma conexão inválida/sem créditos e outra válida; erro seguro na primeira e resposta da segunda. Não registrar erro bruto ou chave |
| H | No Chrome do Galaxy A06: cadastro/login, convite, formulário de API, seleção, envio, leitura, edição/revogação/exportação; testar teclado e rolagem em retrato/paisagem |

A–E/G possuem testes controlados de backend com simulações dos provedores. F tem teste persistente de banco. Testes HTTP/UI sem IA não comprovam A/B/C com provedores reais. Marcar cada cenário real só após execução, com data, modelo exato e resultado observável.

## Fontes oficiais consultadas em 2026-11-06

- OpenAI TypeScript: https://developers.openai.com/api/reference/typescript e https://developers.openai.com/api/docs/quickstart
- Anthropic TypeScript: https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript
- Google GenAI TypeScript: https://googleapis.github.io/js-genai/
- Next.js autenticação: https://nextjs.org/docs/app/guides/authentication
- PostgreSQL RLS: https://www.postgresql.org/docs/current/ddl-rowsecurity.html

Versões obtidas do registro npm e fixadas no lockfile: Next 16.4.5; React 19.3.1; OpenAI 7.53.0; Anthropic 1.6.0; Google GenAI 3.0.0; pg 8.23.1. Não existem modelos “universais” fixados: a conta consulta o catálogo e informa o ID suportado.
