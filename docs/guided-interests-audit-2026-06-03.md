# Auditoria curta — Interesses Guiados do SUÍNDER

## Objetivo

Confirmar que a pendência principal da auditoria anterior — ausência de captura guiada explícita para `looking_for` — foi resolvida sem quebrar descoberta, filtros, compatibilidade ou migrações.

## Revisão dos Interesses Guiados

- O painel de perfil tem o botão **✨ Interesses** ao lado de editar, compatibilidade e pausar/reativar.
- O botão abre um String Select Menu efêmero com seleção múltipla.
- O limite é centralizado em `MAX_PROFILE_INTERESTS = 5` e aplicado no menu, no parser de domínio e na migration 013.
- A persistência usa o campo existente `user_profiles.looking_for`, sem tabela ou lógica paralela.
- O painel de perfil exibe os interesses com emojis; se a lista estiver vazia, orienta o usuário a usar **✨ Interesses**.
- Perfis sem interesses continuam não elegíveis para descoberta porque as queries mantêm `cardinality(target.looking_for) > 0`.

## Revisão de integração

- Descoberta com filtro continua usando `any(target.looking_for)` sobre os interesses permitidos.
- Compatibilidade continua usando interesses compartilhados e lida com lista vazia por `Math.max(..., 1)`, sem divisão por zero.
- O painel público usa a mesma lista `LOOKING_FOR_OPTIONS` e quebra os botões de filtro em linhas válidas do Discord.
- A migration 013 normaliza valores antigos (`Amizades` → `Amizade`, `Call e Conversa` → `Conversar`/`Calls`) e limita a lista migrada a 5 itens para evitar falha de constraint em perfis antigos amplos.
- A nova lista está consistente entre domínio, bot, filtros públicos, README, especificação e checks offline.

## Problemas encontrados por severidade

### Crítico

Nenhum problema crítico encontrado.

### Alto

Nenhum problema alto pendente. A pendência alta anterior de interesses implícitos foi resolvida com o menu **✨ Interesses** e persistência em `looking_for`.

### Médio

1. **Perfis ativos sem interesses podem existir, mas não aparecem na descoberta.**
   - Impacto: usuário pode criar/editar perfil e ainda precisar configurar interesses antes de aparecer na descoberta.
   - Recomendação: no beta, observar se a orientação do painel é suficiente; se houver confusão, adicionar microcopy mais explícita no retorno pós-criação.
   - Precisa corrigir antes do beta: não.

### Baixo

1. **Interesses antigos são normalizados com limite de 5 na migration 013.**
   - Impacto: perfis antigos com muitas categorias podem perder algumas categorias ao serem migrados para respeitar o novo limite.
   - Recomendação: aceitável para preservar o limite e evitar falha de migration; comunicar se houver usuários beta com perfis pré-existentes.
   - Precisa corrigir antes do beta: não.

## O que precisa ser corrigido antes do beta

Nenhum item novo precisa ser corrigido antes do beta controlado. Ainda é necessário executar migrations em PostgreSQL real/staging antes da produção, como já apontado na auditoria anterior.

## Confirmação final

**Sim, o SUÍNDER base pode ser considerado MVP fechado para beta controlado.** A principal pendência funcional da auditoria — Interesses Guiados — foi resolvida. Antes de iniciar o Suíte às Cegas, recomenda-se apenas validar migration/deploy em ambiente real e observar no beta se usuários configuram interesses antes de tentar descoberta.
