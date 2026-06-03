import type { EmbedBuilder } from 'discord.js';

export const SUINDER_VISUAL_ASSETS = {
  BANNER_INICIAL: 'https://cdn.discordapp.com/attachments/1511571213905039370/1511571237854253126/content.png?ex=6a20efea&is=6a1f9e6a&hm=3cd2feda10270d3594fbe6d17edf309e5af3b5cf538a89712a695db0ad4d626f&',
  BANNER_CRIAR_PERFIL: 'https://cdn.discordapp.com/attachments/1511571213905039370/1511571514032656384/content.png?ex=6a20f02c&is=6a1f9eac&hm=a3e10707a29f719fe332cf5cc4b6530c1127f5a80c3bc439dc4f6b3b401f72d1&',
  BANNER_PERFIL: 'https://cdn.discordapp.com/attachments/1511571213905039370/1511572523727458426/content.png?ex=6a20f11d&is=6a1f9f9d&hm=5232356f644d9dd0c432e410cd06066b934484af9c5cebff806c4210aff1d325&',
  BANNER_PERFIL_PAUSADO: 'https://cdn.discordapp.com/attachments/1511571213905039370/1511580583342641283/content.png?ex=6a20f89e&is=6a1fa71e&hm=1e5fefac31d1d54c715016a2a836193598ec825268f5ee03ff29ecefb849d6ba&',
  BANNER_DESCOBRIR: 'https://cdn.discordapp.com/attachments/1511571213905039370/1511581916334133298/content.png?ex=6a20f9dc&is=6a1fa85c&hm=73415c104392954169376ae89a41d973d129f5c17eb483435312e828298d1d3b&',
  BANNER_MATCH: 'https://cdn.discordapp.com/attachments/1511571213905039370/1511578018617757746/content.png?ex=6a20f63b&is=6a1fa4bb&hm=6452074e7765b1dd546f459664b8e7feb96a26154c06c6a3fa87b7a65c3149be&',
  BANNER_SEM_PERFIS: 'https://cdn.discordapp.com/attachments/1511571213905039370/1511578457534890146/content.png?ex=6a20f6a4&is=6a1fa524&hm=4693d1a832c031b360ad6add1152bcc9af11c593edb0ee4065a8ac6a5cb9dc9f&',
  BANNER_MATCHES: 'https://cdn.discordapp.com/attachments/1511571213905039370/1511578018617757746/content.png?ex=6a20f63b&is=6a1fa4bb&hm=6452074e7765b1dd546f459664b8e7feb96a26154c06c6a3fa87b7a65c3149be&',
  BANNER_ADMIN: 'https://cdn.discordapp.com/attachments/1511571213905039370/1511581028463153293/content.png?ex=6a20f909&is=6a1fa789&hm=86a7a298a7634eadffd096455c8a969cee086a46efdf754f2a80a1f06980cd47&',
  BANNER_DENUNCIAS: 'https://cdn.discordapp.com/attachments/1511571213905039370/1511581028463153293/content.png?ex=6a20f909&is=6a1fa789&hm=86a7a298a7634eadffd096455c8a969cee086a46efdf754f2a80a1f06980cd47&',
  BANNER_SUPER_LIKE: 'https://cdn.discordapp.com/attachments/1511571213905039370/1511582412046336132/content.png?ex=6a20fa52&is=6a1fa8d2&hm=ee9e82bcb0d7fe98b6676739d55662ab63493595af2c1c7d46d7df0fadd711af&',
  BANNER_SUPER_MATCH: 'https://cdn.discordapp.com/attachments/1511571213905039370/1511582412046336132/content.png?ex=6a20fa52&is=6a1fa8d2&hm=ee9e82bcb0d7fe98b6676739d55662ab63493595af2c1c7d46d7df0fadd711af&',
  BANNER_ANONIMO: 'https://cdn.discordapp.com/attachments/1511571213905039370/1511582826355495063/content.png?ex=6a20fab5&is=6a1fa935&hm=bf1545c810152e3b8ecd6a26f93eec2c61f472d55b59f85ab34ae96205d9d43f&'
} as const;

export type SuinderVisualAssetKey = keyof typeof SUINDER_VISUAL_ASSETS;

export function applyVisualBanner(embed: EmbedBuilder, assetKey: SuinderVisualAssetKey): EmbedBuilder {
  const imageUrl = SUINDER_VISUAL_ASSETS[assetKey].trim();
  if (imageUrl) {
    embed.setImage(imageUrl);
  }

  return embed;
}
