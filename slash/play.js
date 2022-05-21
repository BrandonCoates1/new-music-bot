const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed, MessageComponentInteraction } = require('discord.js');
const { QueryType } = require('discord-player');
const RadioBrowser = require('radio-browser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Load songs from youtube')
    .addSubcommand((subcommand) => subcommand
      .setName('song')
      .setDescription('Loads a single song from a url')
      .addStringOption((option) => option.setName('url').setDescription('The songs url').setRequired(true))
    )
    .addSubcommand((subcommand) => subcommand
      .setName('playlist')
      .setDescription('Loads a set of songs from a url')
      .addStringOption((option) => option.setName('url').setDescription('The playlists url').setRequired(true))
    )
    .addSubcommand((subcommand) => subcommand
      .setName('search')
      .setDescription('Searches for song based on provided keywords')
      .addStringOption((option) => option.setName('searchterms').setDescription('The search keywords').setRequired(true))
    )
    .addSubcommand((subcommand) => subcommand
      .setName('radio')
      .setDescription('Loads a radio station')
      .addStringOption((option) => option.setName('station').setDescription('The radio station').setRequired(true))
    ),
  run: async ({ client, interaction }) => {
    if (!interaction.member.voice.channel) {
      return await interaction.editReply('You need to be in a VC to use this command!');
    }
    const queue = await client.player.createQueue(interaction.guild);
    if (!queue.connection) await queue.connect(interaction.member.voice.channel);

    let embed = new MessageEmbed();

    if (interaction.options.getSubcommand() === 'song') {
      let url = interaction.options.getString('url');
      const result = await client.player.search(url, {
        requestedBy: interaction.user,
        searchEngine: QueryType.YOUTUBE_VIDEO,
      });
      if (result.tracks.length === 0) return await interaction.editReply('No results');

      const song = result.tracks[0];
      await queue.addTrack(song);
      embed.setDescription(`${song.title} has been added to the queue!`)
        .setThumbnail(song.thumbnail)
        .setFooter({ text: `Duration: ${song.duration}` });

    } else if (interaction.options.getSubcommand() === 'playlist') {
      let url = interaction.options.getString('url');
      const result = await client.player.search(url, {
        requestedBy: interaction.user,
        searchEngine: QueryType.YOUTUBE_PLAYLIST,
      });
      if (result.tracks.length === 0) {
        return await interaction.editReply('No results');
      }

      const playlist = result.playlist;
      await queue.addTracks(result.tracks);
      console.log(result.tracks);
      embed.setDescription(`**${result.tracks.length} songs from [${playlist.title}](${playlist.url})** have been added to the Queue`)
        .setThumbnail(playlist.thumbnail)
        // TODO: added a check for the duration of the songs retrieved
        .setFooter({ text: `Duration: unknown` });

    } else if (interaction.options.getSubcommand() === 'search') {
      let url = interaction.options.getString('searchterms');
      const result = await client.player.search(url, {
        requestedBy: interaction.user,
        searchEngine: QueryType.AUTO,
      });
      if (result.tracks.length === 0) {
        return await interaction.editReply('No results');
      }

      const song = result.tracks[0];
      await queue.addTrack(song);
      console.log(queue.nowPlaying());
      embed.setDescription(`${song.title} has been added to the queue!`)
        .setThumbnail(song.thumbnail)
        .setFooter({ text: `Duration: ${song.duration}` });

    } else if (interaction.options.getSubcommand() === 'radio') {
      let station = interaction.options.getString('station');
      const radio = await RadioBrowser.searchStations({ name: station, countrycode: "GB", language: "english" });
      let radiosList = [];
      for (let i = 0; i < radio.length; i++) {
        radiosList.push(`${i + 1}. ${radio[i].name}\n`);
      }

      await interaction.channel.send(radiosList.join(' '))
        .then(() => {
          interaction.channel.awaitMessages({
            filter: (m) => m.author.id === interaction.user.id,
            max: 1,
            time: 10000,
            errors: ['time'],
          })
            .then(async (message) => {
              message = message.first();

              console.log(' ', radio[message.content - 1]);
              await queue.addTrack(radio[message.content - 1]);
              embed.setDescription(`${song.title} has been added to the queue!`)
                .setThumbnail(song.thumbnail)
                .setFooter({ text: `Duration: ${song.duration}` });

              if (!queue.playing) await queue.play();
              await interaction.editReply({
                embeds: [embed]
              });
            });
        })
    }

    if (!queue.playing) await queue.play();
    await interaction.editReply({
      embeds: [embed]
    });
  }
}