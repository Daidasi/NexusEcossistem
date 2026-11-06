# Segurança, privacidade e limites conhecidos

## Proteções implementadas

- API no backend; validação Zod e consultas SQL parametrizadas.
- Autorização por operação e associação a sala/projeto. Credenciais só do dono; snapshots excluem hashes, sessões e chaves.
- AES-256-GCM com IV aleatório e AAD `owner:connection:v1`: copiar ciphertext entre proprietários/conexões não permite descriptografar.
- CSRF por origem exata, JSON obrigatório, cookie HttpOnly/SameSite Strict, limites de corpo e solicitações persistidos no banco.
- Saídas renderizadas como texto React, sem HTML arbitrário. Importação suporta apenas formatos textuais delimitados.
- Memória pessoal nunca vai para provedores. Escopos compartilhados e grants exigem consentimento explícito. Revalidação ocorre antes de cada envio.
- Auditoria sem conteúdo das memórias, chaves ou erros brutos do SDK. Guarda finalidade, conexão destinatária, provedor/modelo, IDs e versões de memórias. Intenção de despacho persiste antes da rede; falhas conservam o registro.
- Respostas derivadas de memórias têm referências propagadas. Uma versão revogada/corrigida/excluída impede o reenvio automático dessas respostas como histórico de contexto.
- Chaves não vão a localStorage, bundles ou logs. Sua digitação ocorre transitoriamente no formulário e é transmitida ao backend: use HTTPS fora de localhost.

## Revogação e retenção

Revogação confirmada bloqueia envios futuros. Ela aguarda chamadas que já seguram os bloqueios de permissão; não cancela informação já enviada. Histórico exibido e dados já recebidos pelos provedores não são apagados retroativamente. Cópias feitas voluntariamente por participantes também não podem ser revogadas pela Nexus.

Cada memória preserva versões em `memory_versions`. Correção de uma importação cria versão derivada com o fingerprint original. Excluir uma memória também exclui suas versões/grants; os eventos de auditoria e respostas do chat permanecem, sem o conteúdo original na auditoria. Import drafts expiram em 30 minutos; snapshots removem expirados. Execute `npm run db:cleanup` a cada 15 minutos em produção para expurgar também sessões/rate limits expirados. Backups precisam de retenção própria e processo de exclusão.

## Orçamento

Reservas são atômicas e usam limite conservador de bytes de entrada e tokens de saída. Custos dependem das tarifas configuradas; não há garantia contábil contra preços errados, mudanças de preço externas ou faturamento excepcional do provedor. Configure também limites no próprio provedor.

Falha anterior ao despacho devolve reserva. Depois que a transmissão pode ter ocorrido, falhas cobram localmente o máximo reservado até conciliação, sem retries automáticos. Crash pode deixar reserva pendente; a limpeza marca runs interrompidos, mas nunca libera dinheiro incerto automaticamente. Reconciliação ainda requer operador autorizado e extrato do provedor. Não há promessa de “exactly once” na rede externa.

## Bloqueadores de publicação aberta

1. Contas locais usam e-mail declarado, não verificado. Não há recuperação de senha, MFA ou interface para sessões/dispositivos. Implantação compartilhada exige beta restrita e identificação externa dos convidados; antes de publicação aberta, integrar OIDC/auth gerenciada ou verificação de e-mail.
2. Não há isolamento por RLS nem proteção contra administrador do banco/servidor. Aplicação centraliza autorização; banco deve permanecer privado com privilégios mínimos.
3. Limites por conexão não equivalem a fatura exata; não há transferência financeira entre usuários.
4. UI contém até 200 mensagens/memórias recentes por consulta; o histórico completo permanece no banco. Paginação para navegação completa ainda é necessária. Exportação das próprias memórias não usa esse limite.
5. Chamadas seguram bloqueios até 45 segundos cada. Antes de carga alta, implementar workers e medir filas/deadlocks. Remoção de membro e despacho usam ordem de bloqueios compatível; testar concorrência em PostgreSQL real.
6. Memórias/importações maliciosas podem tentar prompt injection. Separação de papéis reduz risco; não é garantia matemática de comportamento do modelo. Não há ferramentas executáveis dadas às IAs nesta versão.
7. Sem sincronização nativa ou importação automática das memórias internas de ChatGPT/Claude/Gemini. TXT/MD, algumas exportações JSON e exportação Nexus são importados somente por revisão voluntária. Não existe parser para todos os formatos de Google Takeout.

Nunca use cookies extraídos, sessões pessoais ou automação de login como conector de IA. Reporte problemas no repositório privado, sem anexar chaves ou dados de usuários.
