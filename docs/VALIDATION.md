# Checkpoint de validação — 2026-11-06

Branch: `feat/nexusbridge-v0.1`. Repositório privado original preservado: `Daidasi/NexusEcossistem`. A branch `main` não recebeu alterações.

## Evidências já obtidas

- Instalação reproduzível por `npm ci`.
- Lint e verificação TypeScript passaram.
- Build Next.js de produção passou.
- 26 testes unitários/integração/adversariais passaram no PostgreSQL embarcado PGlite.
- A suíte inicial de 18 testes passou também em PostgreSQL nativo 18.6 local e PostgreSQL 17.11 no CI.
- Dois testes HTTP end-to-end passaram no CI, contra o servidor Next.js de produção e PostgreSQL.
- Auditoria npm após atualização transitiva: zero vulnerabilidades. Override direcionado de minimatch 11.0.5, com lint/tests reexecutados; eslint 9 é descontinuado pelo fornecedor e requer acompanhamento.
- Preview de desenvolvimento abriu a tela real de autenticação no navegador.

## Revisão crítica e correções

A revisão independente de segurança/privacidade/custos encontrou e motivou: intenção de despacho durável antes da API; tarifas obrigatórias na troca de modelo; revalidação da configuração reservada; distinção entre falha antes/depois do envio; exportação sem truncamento; importação atômica; limpeza de drafts; versões persistentes; ajuste de ordem/tipo de bloqueios.

Sem notas arbitrárias de qualidade. Não recomendamos merge para produção antes de fechar validação real dos provedores, identidade de usuários na hospedagem e teste Android físico.

## Validação em andamento neste checkpoint

- Reexecução no PostgreSQL nativo e regressões das correções finais no CI.
- O primeiro CI falhou somente no browser: seletor de “Criar sala” ambíguo no desktop e nome acessível de “Provedor” no mobile. Corrigidos; reexecução pendente neste checkpoint.
- O endpoint do preview abriu no navegador, mas não ficou acessível por loopback ao executor dos testes HTTP locais; a tentativa local retornou ECONNREFUSED. Os mesmos testes HTTP passaram no CI.
- Nenhuma API externa de IA validada: faltam credenciais autorizadas dos provedores.
- Não há demonstração publicada. Sem PostgreSQL/identidade/segredos de hospedagem configurados, publicar só a interface não atenderia a entrega.

Os arquivos `.env.local`, `.data`, relatórios temporários e credenciais sintéticas não são enviados ao GitHub. Consulte a última atualização deste documento e os checks do PR para o resultado final.

## Correções após a retomada

Convites pendentes são invalidados quando um participante é removido. Atualizações de credenciais são serializadas para não restaurar chaves antigas. A intenção de despacho usa a configuração efetivamente reservada. Memórias compartilhadas podem tornar-se privadas, retirando tanto leitura humana quanto envio a agentes. Tentativas de reenvio no mesmo formulário reutilizam a chave de idempotência após falha de rede.
