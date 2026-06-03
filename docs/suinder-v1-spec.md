# SUÍNDER — Especificação Técnica V1

## 1. Visão geral

SUÍNDER é um bot para Discord focado em conexões sociais dentro da comunidade Suíte. A V1 deve ser deliberadamente simples, moderável e auditável. O objetivo não é criar um aplicativo de namoro completo dentro do Discord, mas sim uma camada controlada de descoberta de perfis, curtidas, passes, matches, bloqueios, denúncias, pausa de perfil e logs administrativos.

A decisão arquitetural mais importante da V1 é evitar funcionalidades que aumentem risco social antes de existir governança operacional madura. Por isso, a V1 não deve incluir chat anônimo, compatibilidade inteligente, revelação automática de identidade, IA ou sistema de perguntas.

## 2. Escopo da V1

### 2.1 Funcionalidades incluídas

- Perfil de usuário.
- Curtir perfil.
- Passar perfil.
- Match quando duas pessoas se curtem mutuamente.
- Bloquear usuário.
- Denunciar usuário.
- Pausar perfil.
- Logs administrativos.
- Respostas e fluxos com mensagens efêmeras sempre que houver informação sensível ou ação individual.

### 2.2 Funcionalidades explicitamente fora do escopo

- Chat anônimo.
- Compatibilidade inteligente.
- Revelação automática de identidade.
- IA.
- Sistema de perguntas.
- Ranking público de usuários.
- Feed público de matches.
- Recomendação baseada em comportamento sensível.
- Compartilhamento de estatísticas individuais de rejeição, likes recebidos ou passes recebidos.

## 3. Riscos técnicos

### 3.1 Dependência da API do Discord

O Discord impõe limites de taxa, regras de intents, restrições de interação e mudanças frequentes na API. A arquitetura não deve assumir que todos os dados de membros estarão sempre disponíveis em cache.

Mitigações:

- Usar slash commands e componentes interativos em vez de comandos por mensagem comum.
- Evitar dependência desnecessária de privileged intents.
- Persistir IDs do Discord, mas buscar dados mutáveis sob demanda.
- Implementar tratamento explícito para rate limits.
- Separar camada de domínio da camada de Discord para facilitar testes e futuras migrações.

### 3.2 Consistência em ações concorrentes

Likes, passes, bloqueios e denúncias podem acontecer quase simultaneamente. Sem transações, podem surgir matches indevidos, duplicidade de likes ou inconsistência entre bloqueio e match.

Mitigações:

- Usar transações de banco em operações de like, pass, bloqueio e match.
- Definir índices únicos para impedir duplicidade lógica.
- Fazer a criação de match de forma idempotente.
- Revalidar bloqueios antes de criar match.

### 3.3 Privacidade e vazamento de dados

Mesmo sem revelação automática de identidade, o próprio Discord ID pode permitir inferências. Logs administrativos e mensagens de match também podem expor dados sensíveis.

Mitigações:

- Exibir apenas o mínimo necessário em mensagens efêmeras.
- Evitar logs em canais públicos.
- Restringir logs administrativos a um canal configurado e cargos autorizados.
- Não armazenar dados desnecessários como DM content, histórico de conversa ou informações externas.
- Ter política clara de retenção de denúncias, perfis e logs.

### 3.4 Falha em migrações e evolução do schema

Sistemas sociais evoluem rápido. Um schema improvisado dificulta moderação, auditoria e mudanças de política.

Mitigações:

- Usar migrações versionadas desde o início.
- Separar tabelas de perfil, interações, denúncias, bloqueios e auditoria.
- Evitar colunas semânticas genéricas como `data` para regras centrais do domínio.
- Adotar timestamps consistentes em UTC.

### 3.5 Disponibilidade e recuperação

Se o bot cair no meio de uma interação, o usuário pode repetir a ação. Isso pode gerar duplicidade ou estado confuso.

Mitigações:

- Operações idempotentes.
- Botões com custom IDs contendo apenas referências opacas, não dados sensíveis.
- Revalidação no servidor antes de executar qualquer ação.
- Job periódico para expirar sessões de visualização antigas, se forem usadas.

### 3.6 Segurança operacional

Tokens do Discord, conexão de banco e configurações administrativas são ativos críticos.

Mitigações:

- Nunca commitar segredos.
- Usar variáveis de ambiente.
- Validar guild ID permitido.
- Bloquear execução do bot fora da guild configurada, se a V1 for exclusiva da comunidade Suíte.
- Registrar eventos administrativos sem expor segredos.

## 4. Riscos de moderação

### 4.1 Assédio por repetição indireta

Mesmo sem chat anônimo, um usuário pode tentar inferir quem o curtiu, insistir fora do sistema ou usar o match como pretexto para importunação.

Mitigações:

- Bloqueio deve impedir recomendações futuras e impedir criação de match.
- Denúncia deve ser simples, efêmera e disponível em todos os pontos relevantes.
- Matches devem vir com aviso de conduta e opção de desfazer/bloquear.
- Moderadores devem poder pausar perfis problemáticos rapidamente.

### 4.2 Pressão social e exposição

Se o sistema revelar rejeições, quantidade de likes ou passes, pode causar constrangimento e conflito comunitário.

Mitigações:

- Nunca exibir quem passou um perfil.
- Nunca mostrar contador de rejeições.
- Não criar rankings.
- Não publicar matches em canal público.

### 4.3 Denúncias falsas ou abusivas

Ferramentas de denúncia podem ser usadas para perseguir alguém.

Mitigações:

- Denúncias devem ter categorias e descrição opcional limitada.
- Logs devem registrar denunciante, denunciado, contexto e timestamp.
- Moderadores devem ter fluxo de revisão, status e resolução.
- Não punir automaticamente apenas por volume de denúncias na V1.

### 4.4 Perfis inadequados

Fotos, biografias ou nomes podem conter conteúdo ofensivo, sexualizado, spam ou dados pessoais indevidos.

Mitigações:

- Definir regras explícitas de perfil.
- Permitir que moderadores pausem perfil e solicitem edição.
- Limitar tamanho de bio e campos livres.
- Evitar upload próprio na V1; preferir avatar atual do Discord ou campos textuais controlados.

### 4.5 Menores de idade e consentimento

Sistemas de conexão social podem ser sensíveis se houver menores ou membros sem consentimento claro.

Mitigações:

- Exigir opt-in explícito.
- Não criar perfil automaticamente.
- Exibir termo simples antes da ativação.
- Permitir pausar e excluir perfil.
- Se a comunidade envolver menores, a recomendação crítica é não lançar essa V1 sem política formal de idade e moderação.

## 5. Possíveis abusos do sistema

### 5.1 Enumeração de perfis

Usuários podem tentar visualizar todos os perfis rapidamente para mapear a comunidade.

Soluções:

- Limite diário de perfis vistos.
- Cooldown por comando.
- Ordenação não determinística.
- Não permitir busca direta por usuário na V1.

### 5.2 Spam de likes

Curtir todos os perfis reduz valor social e pode virar mecanismo de assédio.

Soluções:

- Rate limit de likes por janela de tempo.
- Limite diário configurável de curtidas comuns por `guild_id` + usuário, com padrão de 30 por dia.
- Super Like não deve consumir o limite diário de curtidas comuns.
- Limite diário de ações.
- Sinalização administrativa de comportamento anômalo.

### 5.3 Bloqueio usado para manipular recomendação

Bloqueios podem ser usados como filtro agressivo ou retaliação.

Soluções:

- Bloqueio deve existir por segurança, mas sem contadores públicos.
- Moderadores podem ver padrões extremos apenas para investigação.
- Não usar bloqueio como métrica pública ou punitiva automática.

### 5.4 Denúncia como arma social

Grupos podem coordenar denúncias falsas.

Soluções:

- Não aplicar punição automática.
- Registrar evidências e contexto.
- Exigir revisão humana.
- Detectar múltiplas denúncias coordenadas, mas não tratar volume como prova.

### 5.5 Engenharia social fora do bot

Usuários podem usar informações do perfil para abordar outros por DM sem match.

Soluções:

- Não revelar Discord handle completo além do necessário.
- Considerar mostrar menção apenas após match, ou nem isso se a comunidade preferir intermediação por opt-in.
- Avisar que contato fora do consentimento pode violar regras da comunidade.

## 6. Melhorias de arquitetura recomendadas

### 6.1 Separar domínio, aplicação e adaptadores

A V1 não deve misturar handlers do Discord com regra de negócio. Uma separação mínima recomendada:

- Camada de Discord: slash commands, botões, selects, embeds e mensagens efêmeras.
- Camada de aplicação: casos de uso como criar perfil, curtir, passar, bloquear, denunciar e pausar.
- Camada de domínio: regras puras de elegibilidade, match, visibilidade e moderação.
- Camada de infraestrutura: banco, migrações, logger, configuração e integração Discord.

Benefícios:

- Testes unitários sem Discord.
- Menos risco de bugs em regras sensíveis.
- Evolução futura para painel web ou outras interfaces.

### 6.2 Usar uma fila simples apenas se necessário

A V1 pode funcionar sem fila se o volume for baixo. Porém, eventos administrativos e notificações de match podem ser desacoplados.

Recomendação crítica:

- Não adicionar fila complexa prematuramente.
- Se houver necessidade, usar fila simples para notificações e logs assíncronos.
- Operações centrais de estado devem continuar transacionais no banco.

### 6.3 Escolha de banco

Para V1, PostgreSQL é a melhor escolha se o projeto pretende crescer. SQLite pode servir para protótipo local, mas aumenta risco em concorrência e operação real.

Recomendação:

- Desenvolvimento local: SQLite ou PostgreSQL via Docker.
- Produção: PostgreSQL.
- Migrações: obrigatórias desde o início.

### 6.4 Observabilidade desde o início

Sem observabilidade, moderação e debugging ficam frágeis.

Recomendação:

- Logs estruturados.
- Correlation ID por interação.
- Métricas básicas: comandos executados, falhas, rate limits, denúncias abertas, matches criados.
- Nunca logar tokens, dados sensíveis ou descrições completas de denúncia em serviços externos sem política clara.

## 7. Estrutura de banco de dados sugerida

### 7.1 Tabela `guild_settings`

Configura a guild onde o bot opera.

Campos sugeridos:

- `guild_id` PK.
- `admin_log_channel_id`.
- `moderator_role_id`.
- `enabled`.
- `created_at`.
- `updated_at`.

### 7.2 Tabela `user_profiles`

Representa o perfil opt-in do usuário.

Campos sugeridos:

- `id` UUID PK.
- `guild_id`.
- `discord_user_id`.
- `display_name`.
- `bio`.
- `pronouns` opcional.
- `age_range` opcional, se a política da comunidade permitir.
- `status` enum: `active`, `paused`, `pending_review`, `suspended`, `banned`, `deleted`.
- `created_at`.
- `updated_at`.
- `paused_at`.
- Índice único em `guild_id + discord_user_id`.

Observação crítica: evitar armazenar idade exata na V1, a menos que exista necessidade legal e processo de validação. Faixas etárias ou nenhum campo de idade reduzem risco.

### 7.3 Tabela `profile_actions`

Registra ações de descoberta.

Campos sugeridos:

- `id` UUID PK.
- `guild_id`.
- `actor_profile_id`.
- `target_profile_id`.
- `action` enum: `like`, `pass`.
- `created_at`.
- `expires_at` obrigatório para `pass`, configurado por `guild_settings.pass_expiration_days` e com padrão de 30 dias.
- Índice único em `actor_profile_id + target_profile_id` para impedir múltiplas ações ativas na V1.

Decisão crítica: `pass` deve ocultar temporariamente, não para sempre. A V1 usa expiração configurável para evitar repetição imediata sem criar descarte permanente; bloqueio e denúncia continuam como mecanismos permanentes/moderativos.

### 7.4 Tabela `matches`

Registra matches entre dois perfis.

Campos sugeridos:

- `id` UUID PK.
- `guild_id`.
- `profile_a_id`.
- `profile_b_id`.
- `status` enum: `active`, `blocked`, `closed`, `moderator_closed`, `unmatched`.
- `created_at`.
- `updated_at`.
- Índice único normalizado em menor ID + maior ID para impedir duplicidade.

### 7.5 Tabela `user_blocks`

Registra bloqueios.

Campos sugeridos:

- `id` UUID PK.
- `guild_id`.
- `blocker_profile_id`.
- `blocked_profile_id`.
- `reason` opcional e privado.
- `created_at`.
- Índice único em `blocker_profile_id + blocked_profile_id`.

Regra: se A bloqueia B, A e B não devem se ver novamente no fluxo de descoberta. Se já havia match, o match deve ser encerrado ou marcado como bloqueado.

### 7.6 Tabela `reports`

Registra denúncias.

Campos sugeridos:

- `id` UUID PK.
- `guild_id`.
- `reporter_profile_id`.
- `reported_profile_id`.
- `category` enum: `harassment`, `inappropriate_profile`, `spam`, `impersonation`, `other`.
- `description` opcional com limite de caracteres.
- `status` enum: `open`, `reviewing`, `resolved`, `dismissed`.
- `created_at`.
- `updated_at`.
- `resolved_by_discord_user_id`.
- `resolution_note`.

### 7.7 Tabela `admin_audit_logs`

Registra ações relevantes para auditoria.

Campos sugeridos:

- `id` UUID PK.
- `guild_id`.
- `actor_discord_user_id`.
- `action`.
- `target_profile_id` opcional.
- `metadata` JSONB com dados mínimos.
- `created_at`.

### 7.8 Tabela `interaction_rate_limits`

Opcional, se o rate limit não for totalmente em cache.

Campos sugeridos:

- `id` UUID PK.
- `guild_id`.
- `discord_user_id`.
- `bucket`.
- `count`.
- `window_start`.
- `updated_at`.

## 8. Estrutura de pastas sugerida

```text
suinder/
├── docs/
│   └── suinder-v1-spec.md
├── src/
│   ├── bot/
│   │   ├── client.ts
│   │   ├── commands/
│   │   ├── components/
│   │   └── embeds/
│   ├── application/
│   │   ├── create-profile.ts
│   │   ├── discover-profile.ts
│   │   ├── like-profile.ts
│   │   ├── pass-profile.ts
│   │   ├── block-user.ts
│   │   ├── report-user.ts
│   │   └── pause-profile.ts
│   ├── domain/
│   │   ├── profile.ts
│   │   ├── match.ts
│   │   ├── moderation.ts
│   │   └── visibility.ts
│   ├── infrastructure/
│   │   ├── database/
│   │   ├── repositories/
│   │   ├── logger.ts
│   │   └── config.ts
│   └── main.ts
├── migrations/
├── tests/
│   ├── unit/
│   └── integration/
├── package.json
└── README.md
```

A linguagem não precisa ser TypeScript obrigatoriamente, mas TypeScript com discord.js é uma escolha pragmática pela maturidade do ecossistema. Se a equipe preferir Python, discord.py também é viável, mas a separação arquitetural deve ser mantida.

## 9. Slash commands sugeridos

### 9.1 Comandos de usuário

- `/suinder perfil criar`: inicia criação de perfil com mensagens efêmeras.
- `/suinder perfil ver`: mostra o próprio perfil.
- `/suinder perfil editar`: edita campos permitidos.
- `/suinder perfil pausar`: pausa o próprio perfil.
- `/suinder perfil ativar`: reativa perfil pausado pelo próprio usuário, não perfil pausado por moderação.
- `/suinder perfil excluir`: marca perfil como deletado ou inicia fluxo de exclusão.
- `/suinder descobrir`: mostra próximo perfil elegível.
- `/suinder matches`: lista matches ativos de forma efêmera e permite ver perfil, desfazer match, bloquear ou denunciar.
- `/suinder bloquear`: bloqueia um usuário com quem houve interação ou match, conforme política definida.
- `/suinder denunciar`: denuncia um perfil, preferencialmente a partir de um botão no próprio card de perfil.
- `/suinder ajuda`: explica regras, privacidade e comandos.

### 9.2 Componentes interativos

No card efêmero de descoberta:

- Botão `Curtir`.
- Botão `Passar`.
- Botão `Denunciar`.
- Botão `Bloquear`, se o alvo já for conhecido no contexto permitido.

No card efêmero de match:

- Botão `Ver perfil`.
- Botão `Desfazer match`.
- Botão `Bloquear`.
- Botão `Denunciar`.

No próprio perfil:

- Botão `Editar`.
- Botão `Pausar`.
- Botão `Excluir`.

Em match:

- Botão `Ver orientações`.
- Botão `Bloquear`.
- Botão `Denunciar`.

### 9.3 Comandos administrativos

- `/suinder-admin dashboard`: mostra métricas efêmeras de perfis, matches e denúncias.
- `/suinder-admin perfil`: aprova, suspende, bane, reativa ou consulta histórico de perfil.
- `/suinder-admin denuncias`: lista abertas, vê detalhes, resolve, suspende usuário denunciado ou bane usuário denunciado.
- `/suinder-admin config`: altera canal de logs, canal de denúncias, aprovação manual, expiração de pass, limite diário de likes e toggles de match/denúncias/Super Like.

## 10. Permissões administrativas

### 10.1 Cargos recomendados

- Administrador SUÍNDER: configura o bot e permissões.
- Moderador SUÍNDER: revisa denúncias, pausa perfis e encerra matches.
- Auditor SUÍNDER: consulta logs sem executar ações punitivas.

### 10.2 Matriz de permissões

| Ação | Administrador | Moderador | Auditor |
| --- | --- | --- | --- |
| Configurar canal de logs | Sim | Não | Não |
| Configurar cargo moderador | Sim | Não | Não |
| Ver denúncias | Sim | Sim | Sim |
| Resolver denúncias | Sim | Sim | Não |
| Pausar perfil por moderação | Sim | Sim | Não |
| Reativar perfil pausado por moderação | Sim | Sim | Não |
| Encerrar match | Sim | Sim | Não |
| Consultar auditoria | Sim | Parcial | Sim |
| Exportar dados | Sim | Não na V1 | Não |

### 10.3 Princípios de permissão

- Na implementação atual da V1, o acesso administrativo exige permissão de Administrador do Discord ou cargo configurado como Moderador SUÍNDER.
- Toda ação moderativa deve gerar auditoria com executor, ação, alvo quando aplicável e data.
- Comandos administrativos devem responder de forma efêmera.
- Auto-suspensão e auto-banimento devem ser bloqueados para reduzir abuso ou erro operacional.
- Logs em canal devem conter resumo mínimo e link ou ID para consulta detalhada, não exposição completa de dados sensíveis.

## 11. Fluxos principais da V1

### 11.1 Criação de perfil

1. Usuário executa `/suinder perfil criar`.
2. Bot apresenta termo de uso e regras de conduta em mensagem efêmera.
3. Usuário confirma opt-in.
4. Usuário preenche campos permitidos.
5. Bot valida tamanho, conteúdo básico e duplicidade.
6. Perfil entra como `active` ou `pending_review`, dependendo se haverá revisão manual.

Recomendação crítica: se a comunidade já teve problemas de moderação, usar revisão manual inicial. Se o volume for alto, começar sem revisão manual, mas com denúncia e pausa rápida.

### 11.1.1 Termos de Participação

Antes de criar perfil ou continuar usando o SUÍNDER, o usuário deve aceitar os Termos de Participação vigentes. A versão atual é `2026-06` e o perfil armazena `terms_accepted_at` e `terms_version`. Se a versão mudar no futuro, usuários existentes devem aceitar novamente antes de usar fluxos comuns. Recusar os termos encerra o fluxo sem criar perfil.

### 11.2 Descoberta de perfil

1. Usuário executa `/suinder descobrir` opcionalmente com filtro de sessão por interesse (`Todos`, `Romance`, `Amizades`, `Jogos`, `Filmes e Séries`, `Música`, `Call e Conversa`).
2. Sistema valida se o usuário aceitou a versão atual dos termos e tem perfil ativo.
3. Sistema seleciona perfil elegível respeitando o filtro da sessão quando ele for diferente de `Todos`.
4. Sistema exclui o próprio perfil, perfis bloqueados em qualquer direção, perfis com `pass` ainda válido, perfis fora do filtro escolhido e qualquer perfil que não esteja `active`, +18, com consentimento, termos atuais aceitos e ao menos um interesse.
5. Bot mostra card efêmero com apelido, idade, bio, interesses, avatar do Discord, compatibilidade por regras e aviso discreto de segurança, sem revelar ID do usuário ou dados administrativos.
6. A compatibilidade é calculada sem IA: interesses em comum têm peso maior e respostas iguais às perguntas rápidas opcionais têm peso médio, gerando percentual entre 0% e 100% e principais pontos em comum.
7. `Curtir` respeita o limite diário configurável, registra a curtida e pode criar match; `Passar` e `Próximo` registram descarte temporário; `Bloquear` registra bloqueio e encerra matches ativos; e `Denunciar` abre modal, registra denúncia e aplica bloqueio automático por segurança.

### 11.2.1 Compatibilidade inteligente sem IA

Perguntas rápidas opcionais armazenadas no perfil:

- Call ou Chat.
- Dia ou Noite.
- Grupo ou Conversa Individual.
- Jogos ou Filmes.
- Planejar ou Improvisar.

As respostas são capturadas por menus guiados do Discord no painel de perfil, não por texto livre em modal. Se o usuário não selecionar nenhuma pergunta, o perfil continua válido e a compatibilidade usa apenas interesses.

O cálculo usa apenas regras locais: interesses compartilhados têm peso maior e respostas iguais têm peso médio. O resultado é limitado entre 0% e 100% e exibido apenas durante a descoberta com os principais pontos em comum. Não há IA, API externa, alteração de regras de descoberta, alteração de bloqueios, alteração de limites de likes ou alteração de Super Like.

### 11.3 Curtir e match

1. Usuário clica em `Curtir`.
2. Sistema registra like em transação.
3. Sistema verifica like recíproco.
4. Sistema verifica bloqueios antes de criar match.
5. Se houver reciprocidade, cria match idempotente.
6. Bot responde de forma efêmera à pessoa que clicou, tenta enviar DM para ambos de forma best-effort e não quebra o fluxo se alguma DM falhar.
7. O sistema registra log administrativo apenas quando um match é criado; curtidas comuns não devem gerar log administrativo individual.

Observação crítica: mensagens efêmeras só existem como resposta a interações. Para notificar fora de uma interação ativa, a V1 usa DM best-effort e informa na resposta efêmera que a entrega pode falhar se a pessoa estiver com DM fechada.


### 11.4 Gerenciar matches

1. Usuário executa `/suinder matches`.
2. Sistema valida se o usuário aceitou a versão atual dos termos e tem perfil ativo.
3. Sistema lista apenas matches `active` pertencentes ao perfil do usuário, excluindo matches bloqueados, desfeitos, encerrados, deletados ou indisponíveis por bloqueio em qualquer direção.
4. Card efêmero mostra apelido, idade, interesses, data do match, status e aviso discreto de segurança, sem revelar IDs ou dados administrativos.
5. `Ver perfil` mostra o perfil do match de forma efêmera.
6. `Desfazer match` altera status para `unmatched`, preserva o registro, não notifica a outra pessoa por DM e registra log administrativo mínimo de match encerrado.
7. `Bloquear` reutiliza bloqueio, marca match ativo como `blocked` e impede descoberta em ambas as direções.
8. `Denunciar` abre modal, registra denúncia, aplica bloqueio automático e encerra o match ativo por segurança.
9. Toda ação valida que o match pertence ao usuário antes de executar.

### 11.5 Passar perfil

1. Usuário clica em `Passar`.
2. Sistema registra `pass` temporário com `expires_at`.
3. Perfil não aparece novamente enquanto o `pass` estiver válido; por padrão, o descarte expira em 30 dias.
4. Nenhuma notificação é enviada ao alvo.

### 11.6 Bloquear usuário

1. Usuário aciona bloqueio.
2. Sistema registra bloqueio.
3. Sistema encerra ou marca matches existentes como bloqueados.
4. Sistema impede descoberta futura nos dois sentidos.
5. Bot confirma de forma efêmera.

### 11.7 Denunciar usuário

1. Usuário aciona denúncia.
2. Bot solicita categoria e descrição opcional.
3. Sistema registra denúncia.
4. Sistema envia log administrativo resumido.
5. Moderadores revisam e resolvem.

### 11.7 Pausar perfil

1. Usuário executa `/suinder perfil pausar`.
2. Sistema muda status para `paused`.
3. Perfil deixa de aparecer em descoberta.
4. Matches existentes permanecem registrados, mas nenhuma nova descoberta ocorre.

Perfil pausado por moderação deve usar status separado `suspended`, para impedir reativação pelo usuário; casos graves podem usar `banned`.


### 11.8 Painel administrativo

1. Moderador executa `/suinder-admin dashboard` para ver contadores de perfis ativos, pendentes, suspensos, banidos, matches ativos, denúncias abertas e denúncias resolvidas.
2. `/suinder-admin perfil` permite aprovar, suspender, banir, reativar e ver histórico de um perfil existente; perfis inexistentes são rejeitados.
3. `/suinder-admin denuncias` permite listar denúncias abertas, ver detalhes, resolver, suspender ou banir o usuário denunciado.
4. `/suinder-admin config` permite alterar canal de logs, canal de denúncias, aprovação manual de perfil, expiração do pass, ativação de match e ativação de denúncias.
5. Todas as respostas são efêmeras e toda ação administrativa registra log.
6. O sistema impede auto-suspensão, auto-banimento e acesso sem permissão.

## 12. Regras de elegibilidade de descoberta

Um perfil pode ser mostrado se:

- Está na mesma guild.
- Está `active`.
- Tem idade +18, consentimento +18 registrado e ao menos um interesse.
- Não pertence ao usuário atual.
- Não foi bloqueado por nenhum dos lados.
- Não tem ação `pass` ainda válida do usuário atual; `Próximo` também registra `pass` temporário para evitar repetição infinita.
- Não está em match ativo com o usuário atual.
- Não está `deleted`, `paused`, `pending_review`, `suspended` ou `banned`.

Critério de ordenação recomendado:

- Aleatório ponderado simples na V1.
- Evitar algoritmo inteligente.
- Evitar priorizar por popularidade.
- Opcionalmente equilibrar exposição para não mostrar sempre os mesmos perfis.


### 12.4 Invariantes de estabilização

- Ações comuns de descoberta e matches exigem perfil `active`; perfis `pending_review`, `paused`, `suspended`, `banned` e `deleted` não podem descobrir, curtir ou gerenciar matches.
- `match_enabled=false` bloqueia curtidas e ações comuns de matches.
- `reports_enabled=false` bloqueia denúncias comuns, inclusive botões/modais antigos.
- Botões e modais podem conter IDs internos, mas toda ação revalida `guild_id`, perfil ativo, posse do match ou elegibilidade do alvo no servidor antes de alterar dados.
- Updates críticos de perfil devem filtrar por `guild_id`; soft delete/status deve preservar denúncias, bloqueios, matches e logs.
- Nenhuma query de descoberta deve retornar perfis `pending_review`.

## 13. Mensagens efêmeras

A V1 deve usar mensagens efêmeras para:

- Criação, edição e visualização do próprio perfil.
- Cards de descoberta.
- Confirmação de like, pass, bloqueio e denúncia.
- Respostas administrativas contendo dados sensíveis.

Limitação importante: mensagens efêmeras não substituem persistência nem notificações assíncronas. Se o bot precisar avisar match após uma ação, isso funciona na resposta da interação atual, mas avisar a outra pessoa pode exigir DM ou consulta posterior via comando.

## 14. Logs administrativos

Eventos mínimos a registrar:

- Perfil criado.
- Perfil editado.
- Perfil pausado pelo usuário.
- Perfil pausado por moderação.
- Perfil reativado.
- Perfil deletado.
- Denúncia criada.
- Denúncia resolvida.
- Match criado.
- Match encerrado por bloqueio ou moderação.
- Bloqueio criado.
- Falha relevante de permissão ou configuração.

Dados que não devem ir para canal de log público:

- Descrições completas de denúncia, se forem sensíveis.
- Dados de configuração secretos.
- Conteúdo que exponha rejeições ou passes.
- Estatísticas individuais de popularidade.

## 15. Funcionalidades para versões futuras

### 15.1 Futuro próximo, se a V1 estabilizar

- Painel web administrativo.
- Fluxo de revisão de perfil antes de ativar.
- Exportação moderada de auditoria.
- Métricas agregadas e anônimas.
- Configuração por guild, se o bot deixar de ser exclusivo da Suíte.

### 15.2 Futuro com cautela

- Preferências simples de descoberta, desde que não criem discriminação ou exposição indevida.
- Ajustes avançados de duração de pass por comunidade ou reset controlado de ações.
- Denúncia com anexos, se houver política clara de armazenamento.
- Filtros básicos de segurança.

### 15.3 Não recomendado até haver maturidade operacional

- Chat anônimo.
- IA para compatibilidade.
- Revelação automática de identidade.
- Sistema de perguntas.
- Ranking de perfis.
- Gamificação de likes.
- Sugestões baseadas em comportamento social sensível.

## 16. Especificação técnica consolidada da V1

### 16.1 Requisitos funcionais

- Usuário pode criar um único perfil por guild.
- Usuário pode visualizar e editar o próprio perfil.
- Usuário pode pausar e reativar o próprio perfil, exceto quando pausado por moderação.
- Usuário pode descobrir perfis elegíveis.
- Usuário pode curtir um perfil exibido.
- Usuário pode passar um perfil exibido.
- Sistema cria match quando existe like recíproco e não há bloqueio.
- Usuário pode bloquear outro usuário dentro dos contextos permitidos.
- Usuário pode denunciar outro perfil.
- Moderadores podem revisar denúncias.
- Moderadores podem pausar perfis.
- Administradores podem configurar canal de logs e cargos.
- Sistema registra auditoria para eventos relevantes.

### 16.2 Requisitos não funcionais

- Todas as operações sensíveis devem ser auditáveis.
- Ações de like, pass, match, bloqueio e denúncia devem ser transacionais.
- O bot deve responder dentro do prazo esperado por interações do Discord.
- Dados sensíveis devem ser minimizados.
- O sistema deve tolerar repetição de interações sem duplicar estado.
- O sistema deve operar com rate limits por usuário.
- A arquitetura deve permitir testes unitários de regras sem conexão ao Discord.

### 16.3 Invariantes de domínio

- Um usuário não pode ver o próprio perfil no fluxo de descoberta.
- Perfis pausados não aparecem em descoberta.
- Perfis deletados não aparecem em descoberta.
- Bloqueio impede descoberta nos dois sentidos.
- Bloqueio impede criação de match.
- Uma dupla de perfis não pode ter mais de um match ativo.
- Pass não notifica o usuário alvo.
- Denúncia não gera punição automática.
- Perfil pausado por moderação não pode ser reativado pelo usuário.

### 16.4 Decisões pendentes antes da implementação

- O bot enviará DMs para notificar matches ou apenas mostrará matches quando o usuário executar comando?
- Haverá revisão manual de perfil antes da ativação?
- A comunidade Suíte permite menores de idade nesse fluxo? Se sim, a V1 precisa ser revista antes de implementação.
- Quais campos de perfil são aceitáveis?
- Por quanto tempo denúncias e logs serão retidos?
- Qual será o limite diário de descoberta e likes?
- Quem poderá ver detalhes completos de denúncia?

## 17. Recomendação final

A V1 deve priorizar segurança social e simplicidade, não engajamento máximo. O maior risco do SUÍNDER não é técnico; é transformar uma comunidade em um ambiente de pressão, exposição ou assédio. A arquitetura precisa tornar bloqueio, denúncia, pausa e auditoria tão centrais quanto like e match.

A recomendação é implementar primeiro uma V1 pequena, com perfis opt-in, descoberta limitada, matches privados, bloqueio forte, denúncia revisada por humanos e logs administrativos mínimos. Qualquer funcionalidade que aumente opacidade, automação ou intimidade entre usuários deve ficar fora até que a comunidade tenha evidência real de que consegue moderar o sistema.
