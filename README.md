# SUÍNDER

Fundação técnica do bot SUÍNDER para Discord, baseada na especificação V1 em [`docs/suinder-v1-spec.md`](docs/suinder-v1-spec.md).

Esta etapa mantém a base modular do projeto e já implementa os fluxos V1 de perfil, descoberta, descarte, bloqueio, denúncia, curtir e match, sem chat anônimo ou recursos futuros.

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
- Super like.
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

Para aplicar as migrações, crie o banco PostgreSQL indicado em `DATABASE_URL` e execute:

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

Ao iniciar, o bot valida a conexão com o banco, registra os slash commands na guild configurada e faz login no Discord.

## Scripts

- `npm run dev`: executa o bot com `tsx watch`.
- `npm run build`: compila TypeScript para `dist/`.
- `npm start`: executa `dist/main.js`.
- `npm run migrate`: aplica migrações SQL pendentes.
- `npm run migrate:check`: valida offline a estrutura mínima das migrações SQL sem conectar ao banco.
- `npm run discovery:check`: valida offline as regras mínimas da query e do card de descoberta.
- `npm run match:check`: valida offline as regras mínimas de curtida, transação, match único, DM best-effort e logs.
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

## Descoberta V1 com descarte, segurança, curtida e match

O comando `/suinder descobrir` mostra um perfil elegível por vez em mensagem efêmera. O card exibe apenas apelido, idade, bio, interesses e avatar do Discord, sem revelar ID do usuário ou dados administrativos.

A query de descoberta exclui:

- O próprio perfil.
- Perfis que não estejam `active`.
- Perfis sem idade +18, sem consentimento +18 ou sem interesses.
- Perfis `paused`, `pending_review`, `suspended`, `banned` ou `deleted`.
- Perfis bloqueados pelo usuário ou que bloquearam o usuário.
- Perfis que o usuário marcou como `pass` em `profile_actions` enquanto o descarte temporário ainda está válido.

O botão `Curtir` registra `like` em `profile_actions` sem gerar log administrativo individual. Se houver curtida recíproca, o sistema cria um match `active` único dentro de transação, registra apenas o evento `match.created` nos logs administrativos e tenta enviar DM para as duas pessoas; falhas de DM são tratadas como best-effort e não quebram o fluxo efêmero.

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
- `/suinder-admin perfil`: permite aprovar, suspender, banir, reativar e ver histórico de um perfil existente. O sistema bloqueia auto-suspensão e auto-banimento.
- `/suinder-admin denuncias`: permite listar denúncias abertas, ver detalhes, marcar como resolvida, suspender usuário denunciado ou banir usuário denunciado.
- `/suinder-admin config`: permite alterar canal de logs, canal de denúncias, aprovação manual de perfil, dias de expiração do pass, ativação de match e ativação de denúncias.

A estabilização da V1 garante que `match_enabled=false` bloqueia curtidas e ações comuns de matches, `reports_enabled=false` bloqueia denúncias comuns, ações comuns exigem perfil ativo, botões antigos continuam revalidados no servidor e updates críticos de perfil filtram por `guild_id`.
