# Validação da fundação técnica

## Dependências

O `package.json` usa apenas pacotes públicos do ecossistema npm:

- `discord.js`
- `dotenv`
- `pg`
- `zod`
- `@types/node`
- `@types/pg`
- `tsx`
- `typescript`

Não há dependências privadas, pacotes Git, pacotes por URL, workspaces externos ou registry customizado declarados no projeto.

## Registry npm

O projeto define um `.npmrc` local mínimo para forçar o registry público oficial:

```ini
registry=https://registry.npmjs.org/
fund=false
audit=false
package-lock=true
```

Esse arquivo não contém token, credencial, escopo privado ou configuração de autenticação.

## Validações offline

Como a aplicação real das migrações exige PostgreSQL, existem validações offline que rodam sem conexão com banco:

```bash
npm run migrate:check
npm run discovery:check
npm run match:check
npm run matches:check
npm run admin:check
npm run stability:check
npm run v1:check
```

`migrate:check` valida localmente se existem migrações SQL, se os arquivos não estão vazios, se terminam com `;`, se blocos PostgreSQL `$$` estão balanceados, se não há operações destrutivas proibidas e se a migração inicial contém os objetos mínimos da V1.

`discovery:check` valida regras mínimas de elegibilidade, privacidade e ações de descoberta no repositório e no comando. `match:check` valida regras mínimas de curtida, transação de match, unicidade de par, DM best-effort e ausência de log administrativo para curtida comum. `matches:check` valida listagem e gerenciamento de matches ativos, incluindo unmatch por soft update e proteção contra acesso a match alheio. `admin:check` valida o painel administrativo, permissões, ações de perfil, denúncias, configurações e logs. `stability:check` valida invariantes transversais da V1, incluindo filtros por guild, toggles `match_enabled`/`reports_enabled`, rate limits, custom IDs revalidados e ausência de deletes físicos. `v1:check` executa todos os checks offline em sequência.

Essas validações não substituem `npm run migrate` contra um PostgreSQL real nem `npm run lint` com dependências instaladas, mas reduzem o risco quando o banco ou o registry não estão disponíveis no ambiente de validação.

## Resultado observado neste ambiente

- `npm config` confirmou `https://registry.npmjs.org/` como registry efetivo do projeto.
- `npm install` e `npm install --package-lock-only --ignore-scripts` continuaram falhando por `403 Forbidden` ao acessar o registry público a partir deste ambiente.
- `package-lock.json` não pôde ser gerado neste ambiente por causa do bloqueio externo de rede/registry.
- `npm run migrate:check` passou sem banco real, incluindo validação dos campos reais de perfil, status moderativos e constraints de retenção.
- `npm run discovery:check` passou sem banco real, validando regras mínimas de descoberta.
- `npm run match:check` passou sem banco real, validando regras mínimas de curtida e match.
- `npm run matches:check` passou sem banco real, validando regras mínimas de gerenciamento de matches.
- `npm run admin:check` passou sem banco real, validando regras mínimas do painel administrativo.
- `npm run stability:check` passou sem banco real, validando invariantes de estabilização da V1.
- `npm run v1:check` passou sem banco real, executando todos os checks offline da V1.
- `npm run migrate` não pôde executar porque `tsx` não está instalado sem `npm install`.
- `npm run lint` e `npm run build` não puderam validar o TypeScript real porque as dependências não foram instaladas.
