import { AutocompleteInteraction } from 'discord.js';

export async function handleAutocomplete(interaction: AutocompleteInteraction) {
  try {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'coins') {
      const channelId = interaction.channelId;
      const lowRoomId = '1404937454938619927';
      const highRoomId = '1403844895445221445';
      const lowChoices = [100000,200000,300000,400000,500000,600000,700000,800000,900000];
      const highChoices = [1000000,2000000,3000000,4000000,5000000,6000000,7000000,8000000,9000000,10000000];
      const list = channelId === highRoomId ? highChoices : lowChoices;
      const query = String(focused.value || '').toLowerCase();
      const filtered = list.filter(v => (v>=1000000?`${v/1000000}m`:`${v/1000}k`).includes(query));
      await interaction.respond(filtered.slice(0,25).map(v => ({ name: v>=1000000?`${v/1000000}M`:`${v/1000}k`, value: v })));
      return;
    }
    if (focused.name === 'gimmicktype') {
      // Read gamemode robustly from provided options
      let modeOpt = interaction.options.getString('gamemode');
      if (!modeOpt) {
        const gm = (interaction.options as any).data?.find?.((d: any) => d?.name === 'gamemode');
        if (gm && typeof gm.value === 'string') modeOpt = gm.value;
      }
      if (typeof modeOpt === 'string') {
        modeOpt = modeOpt.toLowerCase();
      }
      const all = [
        { name: '4 or Nil', value: '4 OR NIL' },
        { name: 'Bid 3', value: 'BID 3' },
        { name: 'Bid Hearts', value: 'BID HEARTS' },
        { name: 'Crazy Aces', value: 'CRAZY ACES' },
        { name: 'Suicide', value: 'SUICIDE' }
      ];
      const list = modeOpt === 'solo' ? all.filter(o => o.value !== 'SUICIDE') : all;
      const q = String(focused.value || '').toLowerCase();
      const filtered = list.filter(o => o.name.toLowerCase().includes(q));
      await interaction.respond(filtered.slice(0,25));
      return;
    }
  } catch (e) {
    console.error('Autocomplete error:', e);
  }
}
