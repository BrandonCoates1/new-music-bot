const { SlashCommandBuilder } = require('@discordjs/builders');
const voice = require('@discordjs/voice');
const { MessageEmbed } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quit')
    .setDescription('Stops the bot and clears the queue'),
  run: async ({ client, interaction }) => {
    let embed = new MessageEmbed();
    const queue = client.player.getQueue(interaction.guildId);

    if (!queue) {
      const voiceConnection = voice.getVoiceConnection(interaction.guildId);
      if (voiceConnection) {
        voiceConnection.destroy();
        embed.setDescription('Leaving the voice channel.');
        return await interaction.editReply({
          embeds: [embed]
        });
      }
      embed.setDescription('There are no songs in the queue.');
      return await interaction.editReply({
        embeds: [embed]
      });
    }
    queue.destroy(true);
    embed.setDescription('Stopping the queue, have a nice day.');
    return await interaction.editReply({
      embeds: [embed]
    });
  }
}
