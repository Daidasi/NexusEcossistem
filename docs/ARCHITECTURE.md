# Arquitetura v0.1

A aplicação é um monólito modular: uma implantação, limites explícitos de responsabilidade. Facilita a primeira entrega sem criar filas, serviços ou sincronização distribuída antes da necessidade.

| Módulo | Arquivos | Responsabilidade |
|---|---|---|
| NexusCore | `src/modules/core` | Domínio, autorização, salas, convites, reservas e orquestração limitada |
| NexusBridge | `src/modules/bridge` | Interface Adapter, SDKs oficiais e erros seguros |
| NexusMemory | `src/modules/memory` | Importação, versões, escopos, grants por conexão e recuperação |
| NexusInterface | `src/components`, `src/app` | UI responsiva e endpoint backend |
| Identidade | `src/modules/identity` | Scrypt, sessões opacas, rate limits e AES-256-GCM |
| Armazenamento | `src/modules/storage` | PostgreSQL via pg; PGlite exclusivamente para desenvolvimento/teste |

O browser faz operações JSON na mesma origem; somente o backend acessa banco e provedores. O backend cria uma instância SDK com a chave da conexão para cada chamada. Nenhum cliente global carrega uma credencial compartilhada.

## Fluxo de uma resposta

1. Autenticar sessão e conferir origem, tamanho, dados e associação à sala.
2. Validar conexões por UUID, proprietário, autorização de uso e disponibilidade.
3. Persistir mensagem humana e run idempotente. Só pedidos humanos iniciam runs; saídas não geram chamadas espontâneas.
4. Reservar tokens e custo com atualizações condicionais atômicas. Máximo de seis agentes, três rodadas e 1.024 tokens de saída por chamada.
5. Selecionar memórias relevantes e filtrar referências/versionamento de respostas anteriores. Persistir intenção de envio antes de chamar API.
6. Bloquear configuração/permissões pertinentes, revalidar contexto e só então enviar. Sucesso grava resposta, proveniência e consumo; falha é registrada separadamente.
7. UI consulta o estado a cada quatro segundos. Sem streaming token a token nesta versão; respostas de chamadas finalizadas aparecem durante a atualização.

## Decisões de infraestrutura

- **Next.js em Node** para execução longa limitada e SDKs oficiais; PostgreSQL via pool para concorrência. O host precisa admitir requisições de até 300 s. Workers/Sites exigiriam adaptação de runtime, banco HTTP e identidade; não foram usados para fingir uma implantação completa sem esses serviços.
- **Auth local em beta** porque não há tenant gerenciado configurado. Senhas scrypt com salt aleatório; tokens opacos de sessão persistidos apenas por hash; cookie HttpOnly/SameSite Strict/Secure quando HTTPS. Verificação de e-mail/OIDC são bloqueadores para publicação aberta.
- **RLS avaliada e adiada**: nenhum cliente acessa o banco diretamente. O backend é o único consumidor e sua camada de autorização é a fronteira testada. Não alegamos RLS instalada. Antes de expor APIs de banco, exigir role sem BYPASSRLS, políticas e testes com a role real.
- **Busca lexical** evita enviar memórias a um provedor adicional de embeddings. Adapter de armazenamento e domínio permitem acrescentar pgvector posteriormente, preservando filtragem de permissões antes da seleção.
- **Dados em texto simples no banco**, exceto credenciais criptografadas. Criptografia de disco/backups fica a cargo da hospedagem. A aplicação não se declara E2EE.
- **Projetos** agrupam salas e memórias. O convite a sala de projeto precisa de consentimento adicional do dono do projeto. Remover um participante de uma sala não remove sua associação ao projeto, comportamento explicitado na UI.

## Expansão

Novos provedores implementam `Adapter`; novas tarefas podem usar um job runner durável com a mesma idempotência/ledger. Antes de escalar, retirar chamadas externas de transações longas com um protocolo de permissões versionadas e despacho serializável; manter a garantia observável da revogação. Autonomia futura deve continuar limitada por rodadas, orçamento e autorização. Nenhum desses recursos futuros é apresentado como já implementado.
