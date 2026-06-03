# SUÍNDER

Fundação técnica do bot SUÍNDER para Discord, baseada na especificação V1 em [`docs/suinder-v1-spec.md`](docs/suinder-v1-spec.md).

Esta etapa mantém a base modular do projeto e já implementa os fluxos V1 de perfil, descoberta, descarte, bloqueio, denúncia, curtir e match, além do Super Like V2, sem chat anônimo ou modo anônimo.

## O que existe nesta fundação

- Projeto Node.js com TypeScript.
- Discord.js v14 com slash commands registrados por guild.
- Variáveis de ambiente validadas com Zod.
- Conexão PostgreSQL via `pg`.
- Sistema simples de migrações SQL.
- Validação offline da estrutura das migrações sem conexão com banco real.
- Tabelas V1 definidas em `migrations/001_create_v1_tables.sql` e campos reais de perfil em `migrations/002_add_profile_v1_fields.sql`.
- Loader modular de slash commands.
- Comando `/suinder` com subcomandos:
  - `/suinder iniciar`: painel inicial efêmero +18 e opcional.
  - `/suinder perfil`: criação e gerenciamento real do perfil V1.
  - `/suinder descobrir`: mostra um perfil elegível por vez com ações de curtir, passar, bloquear, denunciar e próximo.
  - `/suinder matches`: lista matches ativos e permite ver perfil, desfazer match, bloquear ou denunciar.
  - `/suinder pausar`: pausa o perfil do usuário.
  - `/suinder denunciar`: placeholder administrativo.
- Serviço básico de logs administrativos com persistência em `admin_audit_logs` e envio opcional para canal de logs.
- Logs administrativos para perfil criado, editado, pausado e reativado.
- Respostas efêmeras nos comandos e componentes de perfil.

## Fora do escopo desta etapa

- Chat pós-match ou chat anônimo.
- Modo anônimo.
- IA.
- Compatibilidade inteligente.
- Sistema de perguntas.
- Features futuras descritas na especificação.

## Requisitos

- Node.js 20 ou superior.
- PostgreSQL 14 ou superior.
- Um aplicativo de Discord com token de bot.
- Um servidor Discord para registrar comandos de guild.

## Instalação

```bash
npm install
cp .env.example .env
```

Edite o arquivo `.env` com os valores reais:

```env
DISCORD_TOKEN=replace-me
DISCORD_CLIENT_ID=replace-me
DISCORD_GUILD_ID=replace-me
DATABASE_URL=postgres://postgres:postgres@localhost:5432/suinder
DATABASE_SSL=false
ADMIN_LOG_CHANNEL_ID=
MODERATOR_ROLE_ID=
NODE_ENV=development
LOG_LEVEL=info
```

## Banco de dados

Para validar a estrutura das migrações sem conectar em um banco real, execute:

```bash
npm run migrate:check
```

Para aplicar as migrações em desenvolvimento, crie o banco PostgreSQL indicado em `DATABASE_URL` e execute:

```bash
npm run migrate:dev
```

Em produção, primeiro gere `dist/` com `npm run build` e então aplique as migrações compiladas com:

```bash
npm run migrate
```

O migrator cria `schema_migrations`, e a migração inicial cria:

- `guild_settings`
- `user_profiles`
- `profile_actions`
- `matches`
- `user_blocks`
- `reports`
- `admin_audit_logs`
- `interaction_rate_limits`

## Execução

Modo desenvolvimento:

```bash
npm run dev
```

Build de produção:

```bash
npm run build
npm start
```

O arquivo principal real do projeto é `dist/main.js`. A pasta `dist/` não é versionada e precisa ser gerada antes de iniciar em produção.

Ao iniciar, o bot valida a conexão com o banco, registra os slash commands na guild configurada e faz login no Discord.


## Deploy em produção (Square Cloud / hospedagens Node.js)

Use Node.js 20 ou superior. O projeto foi ajustado para o cenário em que o GitHub/zip contém o código TypeScript (`src/main.ts`) mas não contém `dist/`.

### Square Cloud usando este repositório sem `dist/`

Selecione ou mantenha como **Arquivo Principal**:

```text
src/main.ts
```

Não selecione `dist/main.js` se a pasta `dist/` não existir no GitHub ou no zip enviado, porque a Square Cloud valida se o arquivo principal existe. O arquivo `src/main.ts` existe no repositório e serve como referência de projeto TypeScript; o comando customizado de start compila e depois roda o JavaScript gerado.

O `squarecloud.app` deste repositório está configurado assim:

```text
MAIN=src/main.ts
START=npm run build && npm run migrate && npm start
```

Essa configuração faz a Square Cloud executar a sequência abaixo no start:

1. `npm run build`: compila TypeScript para `dist/`.
2. `npm run migrate`: aplica migrações usando `dist/infrastructure/database/migrate.js`.
3. `npm start`: inicia o bot com `node dist/main.js`.

Por isso, o **entrypoint real em runtime** continua sendo `dist/main.js`, mas o **Arquivo Principal para deploy sem `dist/`** deve ser `src/main.ts`.

### Quando usar `dist/main.js`

Use `dist/main.js` como Arquivo Principal apenas se você gerar o build antes e enviar um zip que já contenha `dist/main.js`.

Build local para gerar `dist/`:

```bash
npm install
npm run build
```

Depois disso, o zip precisa incluir pelo menos `squarecloud.app`, `package.json`, `.npmrc`, `migrations/`, `dist/` e demais arquivos necessários de runtime. Não envie `.env` com segredos no zip; configure as variáveis no painel da hospedagem.

### Comandos finais

- Arquivo principal no deploy sem `dist/`: `src/main.ts`.
- Arquivo real executado após build: `dist/main.js`.
- Build command: `npm run build`.
- Migration command: `npm run migrate`.
- Start command: `npm start`.
- Start command completo para Square Cloud: `npm run build && npm run migrate && npm start`.

Como a Square Cloud pode instalar dependências em modo de produção, `typescript`, `@types/node` e `@types/pg` ficam em `dependencies` para permitir o build na nuvem. O `tsx` permanece em `devDependencies`, porque só é usado em desenvolvimento por `npm run dev` e `npm run migrate:dev`.

Variáveis de ambiente obrigatórias:

- `DISCORD_TOKEN`: token do bot do Discord.
- `DISCORD_CLIENT_ID`: ID da aplicação/bot no Discord.
- `DISCORD_GUILD_ID`: ID da guild onde os slash commands serão registrados.
- `DATABASE_URL`: URL PostgreSQL acessível pela hospedagem.

Variáveis opcionais ou com padrão:

- `DATABASE_SSL`: use `true` se o PostgreSQL da hospedagem exigir TLS; padrão `false`.
- `ADMIN_LOG_CHANNEL_ID`: canal privado para logs administrativos.
- `MODERATOR_ROLE_ID`: cargo autorizado a usar `/suinder-admin` além de administradores do Discord.
- `NODE_ENV`: use `production` em deploy.
- `LOG_LEVEL`: padrão recomendado `info`.

No `squarecloud.app` atual, `npm run migrate` já faz parte do `START` depois do build. Se você optar por iniciar manualmente com apenas `npm start`, rode `npm run migrate` antes. O comando de migração de produção usa `node dist/infrastructure/database/migrate.js`, evitando depender de `tsx` no runtime.

## Scripts

- `npm run dev`: executa o bot com `tsx watch`.
- `npm run build`: compila TypeScript para `dist/`.
- `npm start`: executa `dist/main.js`.
- `npm run migrate`: aplica migrações SQL pendentes a partir do migrator compilado em `dist/infrastructure/database/migrate.js`; exige `npm run build` antes em produção.
- `npm run migrate:dev`: aplica migrações SQL pendentes diretamente do TypeScript com `tsx`, apenas para desenvolvimento.
- `npm run migrate:check`: valida offline a estrutura mínima das migrações SQL sem conectar ao banco.
- `npm run discovery:check`: valida offline as regras mínimas da query e do card de descoberta.
- `npm run quality:check`: valida offline o limite diário de likes, filtros de descoberta, painel público e configuração administrativa relacionada.
- `npm run compatibility:check` / `npm run compatibilidade:check`: valida offline perguntas rápidas, cálculo por regras, persistência e exibição de compatibilidade sem IA.
- `npm run terms:check`: valida offline campos de aceite, versão atual, tela de termos, recusa, aceite antes da criação e revalidação por versão.
- `npm run match:check`: valida offline as regras mínimas de curtida, transação, match único, DM best-effort e logs.
- `npm run super-like:check`: valida offline regras mínimas do Super Like V2, limite semanal, Super Match, logs e configurações.
- `npm run dm:check`: valida offline a obrigatoriedade de DM para criação, reativação, descoberta, curtidas e Super Likes.
- `npm run matches:check`: valida offline listagem e gerenciamento de matches ativos.
- `npm run admin:check`: valida offline o comando administrativo, permissões e ações de moderação.
- `npm run stability:check`: valida invariantes V1 de estabilização, como filtros por guild, toggles, rate limits e soft delete.
- `npm run v1:check`: executa todos os checks offline da V1 em sequência.
- `npm run lint`: roda `tsc --noEmit` como validação estática.

## Observações de segurança

- Não commite `.env`.
- Use mensagens efêmeras para respostas sensíveis.
- Execute `npm run migrate` antes de iniciar o bot.
- Configure `ADMIN_LOG_CHANNEL_ID` apenas para um canal privado de moderação.
- Likes comuns não geram log administrativo; matches criados/encerrados e ações administrativas são registrados para auditoria mínima.
- A visualização de descoberta é efêmera e não gera log administrativo apenas por visualizar um perfil.

## Perfil V1

O fluxo real de perfil usa `/suinder perfil` e componentes efêmeros do Discord. Se o usuário ainda não tiver perfil ativo, pendente ou pausado, o bot mostra um botão para abrir o formulário de criação. Se já existir perfil, o bot mostra o perfil atual com ações para editar, pausar/reativar ou excluir.

Status de perfil:

- `active`: elegível para descoberta futura, desde que tenha +18, consentimento e interesses válidos.
- `paused`: pausado pelo usuário e fora da descoberta.
- `pending_review`: aguardando revisão e fora da descoberta.
- `suspended`: suspenso pela moderação e fora da descoberta.
- `banned`: banido e fora da descoberta.
- `deleted`: soft delete; o registro do perfil permanece para preservar segurança, auditoria e relações com denúncias, bloqueios, matches e logs.

Campos do perfil:

- Apelido, limitado a 80 caracteres.
- Idade obrigatória, bloqueando valores menores que 18.
- Bio curta, limitada a 500 caracteres.
- O que procura: `Romance`, `Amizades`, `Jogos`, `Filmes e Séries`, `Música`, `Call e Conversa`.
- Consentimento +18 obrigatório.
- Preferência de receber DM: sim ou não.
- Avatar atual do Discord como foto padrão, sem upload de imagem.

A configuração `guild_settings.profile_review_required` controla se novos perfis ficam `active` imediatamente ou `pending_review` como pendentes de revisão.


## Validação obrigatória de DM

O SUÍNDER verifica mensagens privadas antes de permitir participação em fluxos que dependem de DM. Durante a criação de perfil e a reativação de perfil, o bot envia uma mensagem de teste ao usuário:

```text
💚 Bem-vindo ao SUÍNDER.

Esta é uma mensagem de verificação.
Se você recebeu este aviso, sua conta está pronta para participar.
```

Se a DM falhar, o perfil não é criado/reativado naquele momento e a descoberta, curtidas e Super Likes ficam bloqueados até a validação passar. A resposta é sempre efêmera e mostra o botão **Testar Novamente**. Falhas de DM não geram log administrativo; apenas logs técnicos podem ser emitidos para diagnóstico.

## Descoberta V1 com descarte, segurança, curtida e match

O comando `/suinder descobrir` mostra um perfil elegível por vez em mensagem efêmera. Ele aceita o filtro opcional de sessão `filtro` com **Todos**, **Romance**, **Amizades**, **Jogos**, **Filmes e Séries**, **Música** ou **Call e Conversa**. Esse filtro só vale para a sessão atual, não altera o perfil salvo e também é preservado nos botões efêmeros do card. O card exibe apenas apelido, idade, bio, interesses, avatar do Discord e uma porcentagem de compatibilidade calculada localmente por regras, sem IA e sem APIs externas.

A query de descoberta exclui:

- O próprio perfil.
- Perfis que não estejam `active`.
- Perfis sem idade +18, sem consentimento +18 ou sem interesses.
- Perfis `paused`, `pending_review`, `suspended`, `banned` ou `deleted`.
- Perfis bloqueados pelo usuário ou que bloquearam o usuário.
- Perfis que o usuário marcou como `pass` em `profile_actions` enquanto o descarte temporário ainda está válido.

As perguntas rápidas opcionais do perfil são **Call ou Chat**, **Dia ou Noite**, **Grupo ou Conversa Individual**, **Jogos ou Filmes** e **Planejar ou Improvisar**. A compatibilidade combina interesses em comum com peso maior e respostas iguais com peso médio, exibindo os principais pontos em comum sem alterar regras de descoberta, bloqueio, limites de likes ou Super Like.

O botão `Curtir` registra `like` em `profile_actions` sem gerar log administrativo individual. Curtidas comuns consomem o limite diário por `guild_id` + usuário definido em `guild_settings.daily_like_limit`, com padrão de 30 por dia; Super Likes não contam nesse limite. Se houver curtida recíproca, o sistema cria um match `active` único dentro de transação, registra apenas o evento `match.created` nos logs administrativos e tenta enviar DM para as duas pessoas; falhas de DM são tratadas como best-effort e não quebram o fluxo efêmero.

O botão `⭐ Super Like` registra `super_like` em `profile_actions` e o uso semanal em `super_like_usages`, limitado a 1 uso por `guild_id` + usuário por janela semanal simples. Se não houver curtida recíproca, o alvo recebe uma DM sem revelar quem enviou; se houver curtida recíproca, o sistema cria/atualiza um match com `is_super_match=true`, registra apenas `match.super_created` nos logs administrativos e usa os banners de Super Like/Super Match. A configuração `guild_settings.super_like_enabled` permite desativar o recurso, com padrão ativo.

Os botões `Passar` e `Próximo` registram `pass` temporário em `profile_actions`, com expiração configurável por `guild_settings.pass_expiration_days` e padrão de 30 dias, para evitar repetição imediata sem ocultar para sempre. O botão `Bloquear` registra `user_blocks`, impede descoberta permanente em ambas as direções, marca matches ativos como bloqueados e registra log administrativo mínimo. O botão `Denunciar` abre modal com motivo e detalhes opcionais, registra em `reports`, envia log administrativo/canal configurado e bloqueia automaticamente o perfil denunciado para a opção mais segura.


## Gerenciamento de matches V1

O comando `/suinder matches` mostra uma lista efêmera de até cinco matches ativos do usuário. A lista não revela IDs de usuários nem dados administrativos, e exclui matches bloqueados, encerrados, desfeitos ou associados a perfis deletados/suspensos/banidos.

Cada match listado mostra apelido, idade, interesses, data do match, status e aviso discreto de segurança. As ações disponíveis são:

- `Ver perfil`: mostra o perfil do match de forma efêmera, sem revelar dados administrativos.
- `Desfazer`: altera o status do match para `unmatched`, preservando o registro para auditoria e sem notificar a outra pessoa por DM.
- `Bloquear`: registra bloqueio, encerra o match ativo como `blocked` e impede descoberta em ambas as direções.
- `Denunciar`: abre modal de denúncia, registra em `reports`, aplica bloqueio automático e encerra o match ativo por segurança.


## Painel administrativo V1

O comando `/suinder-admin` é restrito a membros com permissão de Administrador no Discord ou ao cargo configurado como moderador do SUÍNDER. Todas as respostas são efêmeras e toda ação administrativa registra log com executor, ação, alvo quando aplicável e data.

Subcomandos disponíveis:

- `/suinder-admin dashboard`: mostra perfis ativos, pendentes, suspensos, banidos, matches ativos, denúncias abertas e denúncias resolvidas.
- `/suinder-admin painel`: envia no canal atual um painel público fixável com o banner inicial e botões de acesso rápido para criar/ver perfil, descobrir pessoas, filtros de descoberta, ver matches, pausar/reativar perfil e ajuda. O comando é administrativo, mas os botões podem ser usados por membros comuns e sempre respondem de forma efêmera.
- `/suinder-admin perfil`: permite aprovar, suspender, banir, reativar e ver histórico de um perfil existente. O sistema bloqueia auto-suspensão e auto-banimento.
- `/suinder-admin denuncias`: permite listar denúncias abertas, ver detalhes, marcar como resolvida, suspender usuário denunciado ou banir usuário denunciado.
- `/suinder-admin config`: permite alterar canal de logs, canal de denúncias, aprovação manual de perfil, dias de expiração do pass, limite diário de likes, ativação de match, ativação de denúncias e ativação de Super Like.

A estabilização da V1 garante que `match_enabled=false` bloqueia curtidas e ações comuns de matches, `reports_enabled=false` bloqueia denúncias comuns, `super_like_enabled=false` bloqueia Super Likes, ações comuns exigem perfil ativo, botões antigos e botões do painel público continuam revalidados no servidor e updates críticos de perfil filtram por `guild_id`.
