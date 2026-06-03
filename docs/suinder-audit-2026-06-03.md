# Auditoria SUÍNDER — 2026-06-03

## Escopo

Auditoria final da base atual do SUÍNDER antes de iniciar o Suíte às Cegas, sem implementar novas funcionalidades e sem alterar regras de negócio. Foram revisados fluxos de usuário, painel público, administração, segurança/moderação, banco/migrações, UX Discord e prontidão de produção.

## Correções pequenas aplicadas

- `squarecloud.app`: o arquivo principal foi ajustado de `src/main.ts` para `dist/main.js`, pois o projeto é TypeScript compilado e o `start` real executa `node dist/main.js` após `npm run build` e `npm run migrate`.

## Achados por severidade

### Crítico

Nenhum bloqueador crítico foi encontrado nos checks offline e na revisão estática. A base compila e os validadores atuais passam.

### Alto

1. **Interesses do perfil precisavam de captura guiada explícita.**
   - Situação original: o modal foi simplificado para apelido, idade e bio; sem seleção guiada, novos perfis poderiam depender de interesses implícitos.
   - Correção posterior: o painel de perfil passou a ter o botão **✨ Interesses**, com seleção múltipla em `looking_for` e limite de 5 interesses.
   - Status: resolvido para o beta; manter atenção apenas à experiência de usuários que ainda não selecionaram interesses.

2. **Build/deploy em hospedagem depende do pipeline build → migrate → start.**
   - Situação: o código de produção roda em `dist/main.js`; sem build, `dist` não existe.
   - Correção aplicada: `MAIN=dist/main.js` em `squarecloud.app`.
   - Recomendação: confirmar na Square Cloud que o comando `START=npm run build && npm run migrate && npm start` é executado como configurado e que `DATABASE_URL` está disponível antes do migrate.

### Médio

1. **Likes duplicados por botões antigos ainda podem consumir limite diário.**
   - O fluxo de descoberta esconde perfis já curtidos, mas uma interação antiga pode chamar o handler novamente. O upsert evita duplicidade lógica em `profile_actions`, porém o consumo de `daily_like` acontece antes do upsert.
   - Impacto: usuário pode gastar limite diário em clique repetido/antigo.
   - Recomendação: em etapa de hardening, detectar ação já existente antes de consumir limite diário ou tratar idempotência no mesmo fluxo transacional.

2. **Matches encerrados continuam bloqueando recriação por unicidade do par.**
   - A tabela preserva histórico e evita match duplicado. Isso é seguro, mas significa que re-match após `unmatched`/`blocked` não está previsto.
   - Recomendação: manter como decisão de V1 ou documentar explicitamente se re-match futuro será permitido com novo status/ciclo.

3. **Aviso `ephemeral` deprecated do discord.js permanece.**
   - O código ainda usa `ephemeral: true` em vários pontos.
   - Impacto atual: warning de runtime, sem quebra funcional imediata.
   - Recomendação: migrar gradualmente para flags (`MessageFlags.Ephemeral`) em uma tarefa técnica isolada para reduzir risco de regressão.

4. **Aviso SSL do `pg` pode ocorrer quando `DATABASE_URL` contém `sslmode=require`.**
   - O código já suporta `DATABASE_SSL=true` com `rejectUnauthorized: false`, mas URLs de provedores podem trazer `sslmode=require` e gerar warning.
   - Recomendação: padronizar instruções de produção para usar `DATABASE_SSL=true` e testar a URL do provedor; se o warning persistir, tratar parsing de SSL em tarefa dedicada.

### Baixo

1. **Aceite de termos para usuário sem perfil depende de estado em memória até o submit do modal.**
   - Se o bot reiniciar entre aceitar termos e enviar o modal, o usuário precisará aceitar novamente.
   - Impacto: baixo; não há perda de dados persistentes.

2. **Logs administrativos são mínimos, mas histórico admin exibe IDs internos de denúncias.**
   - Isso é aceitável para moderação, mas deve continuar restrito a respostas efêmeras/admin.

3. **Sem testes integrados com banco real nesta auditoria.**
   - Os checks offline validam estrutura e invariantes, mas não substituem aplicar migrations em PostgreSQL real.

## Revisão dos fluxos

### Fluxos de usuário

- `/suinder iniciar`: painel inicial efêmero, sem dados privados.
- `/suinder perfil`: exige termos para novo perfil, abre modal simplificado, mostra perfil existente com ações.
- Aceite/recusa dos termos: custom IDs específicos, aceite abre modal para usuário sem perfil e não deixa interação sem resposta.
- Criação/edição: idade obrigatória 18+, DM verificada antes da criação, consentimento derivado dos termos.
- Compatibilidade por menus: select menus persistem em `compatibility_answers` e não alteram cálculo nem descoberta.
- Descoberta com/sem filtro: query filtra `guild_id`, status elegível, termos atuais, +18, consentimento, interesses, bloqueios e passes válidos.
- Passar/próximo: registra `pass` temporário.
- Curtir/Super Like: usam transação para ação e match; Super Like tem limite semanal separado e não consome limite diário de likes.
- Match/Super Match: match é único por par e logs administrativos só registram criação de match/super match.
- `/suinder matches`, desfazer match, bloquear, denunciar: ações revalidam posse/elegibilidade e mantêm histórico por soft update.
- Pausar/reativar/excluir: pausa/reativa via status; excluir usa `deleted` e não remove fisicamente o perfil.

### Painel público

- `/suinder-admin painel` cria painel público, mas os botões respondem de forma efêmera.
- Custom IDs do painel são prefixados e roteados separadamente.
- Botão antigo/desconhecido recebe fallback amigável, sem falha silenciosa.
- O painel público não exibe perfil, match, denúncia ou dados privados no canal.

### Administração

- `/suinder-admin dashboard`, `painel`, `config`, `perfil` e `denuncias` estão protegidos por administrador ou cargo moderador configurado.
- Ações administrativas registram logs.
- Auto-suspensão e auto-banimento são bloqueados no serviço/admin command.
- Configurações aceitam toggles principais: match, denúncias, Super Like, aprovação manual, expiração do pass e limite diário de likes.

### Segurança e moderação

- Termos possuem versão atual e revalidação por `terms_version`.
- DM obrigatória é verificada para criar/reativar e antes de ações que dependem de DM no fluxo interativo.
- Perfis `paused`, `pending_review`, `suspended`, `banned` e `deleted` não aparecem na descoberta.
- Bloqueio é bilateral para descoberta e encerra matches ativos.
- Denúncia bloqueia automaticamente o denunciado para o denunciante.
- Soft delete preserva perfil e histórico relacionado.
- Rate limits e limite diário existem; Super Like semanal usa tabela dedicada.

### Banco e migrações

- Migrações 001–012 estão em ordem e passam no `migrate:check`.
- Queries críticas revisadas usam `guild_id` nos fluxos centrais de perfil, descoberta, matches, reports e admin.
- Like/match e Super Like/Super Match usam transações.
- Match único é preservado pela normalização do par (`least/greatest`) e constraint de par.
- Não foram encontrados `DELETE` físicos em perfis, matches ou reports na implementação atual.

### UX Discord

- Modal de perfil está simplificado para reduzir erro de cadastro.
- Campo idade aceita `18`, `+18`, `25`, `31` etc. e mostra mensagens claras.
- Select menus de compatibilidade removem texto livre.
- `showModal` é usado diretamente nos fluxos que abrem modal.
- Fallbacks para botões/menus antigos existem.
- Warnings de `ephemeral` deprecated permanecem como dívida técnica baixa/média.

### Produção

- `package.json` possui `build`, `start`, `migrate`, `dev`, `lint` e checks offline.
- `main` aponta para `dist/main.js`.
- `squarecloud.app` agora usa `MAIN=dist/main.js` e `START=npm run build && npm run migrate && npm start`.
- `.env.example` lista `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `DATABASE_URL`, `DATABASE_SSL`, `ADMIN_LOG_CHANNEL_ID`, `MODERATOR_ROLE_ID`, `NODE_ENV`, `LOG_LEVEL`.
- Configuração ausente obrigatória falha no bootstrap via Zod antes de iniciar o bot.

## Precisa corrigir antes do Suíte às Cegas

1. Validar em beta se o menu **✨ Interesses** está claro o suficiente para usuários configurarem `looking_for` antes da descoberta.
2. Testar migrations em PostgreSQL real de staging/produção, incluindo `DATABASE_SSL=true`.
3. Decidir a regra de re-match após `unmatched` antes de adicionar um fluxo novo que possa depender de ciclos/reentradas.

## Pode ficar para depois

1. Migrar `ephemeral: true` para `MessageFlags.Ephemeral`.
2. Tornar likes duplicados por botões antigos totalmente idempotentes em relação ao limite diário.
3. Persistir aceite pré-criação em estrutura separada caso reinícios entre aceite e modal virem problema real.
4. Melhorar testes integrados com banco e Discord mocks.

## Pronto para beta?

**Sim, a base do SUÍNDER está pronta para beta controlado**, desde que o beta seja limitado, acompanhado por moderação, com migrations testadas em banco real antes de produção e com validação real do menu de interesses guiados. Para iniciar o Suíte às Cegas, recomenda-se validar o deploy/migrate em ambiente real e observar se usuários configuram interesses antes da descoberta.
