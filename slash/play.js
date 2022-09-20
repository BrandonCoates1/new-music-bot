const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { QueryType } = require('discord-player');
const RadioBrowser = require('radio-browser');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { splitBar } = require('string-progressbar');

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

    let embed = new MessageEmbed();

    if (interaction.options.getSubcommand() === 'radio') {
      let station = interaction.options.getString('station');
      const radios = await RadioBrowser.searchStations({ name: station, countrycode: 'GB', language: 'english', limit: 10 });

      if (radios.length === 0) {
        embed.setDescription(`The requested search term ${station} has yielded no results!`)
          .setFooter({ text: 'Try again with a different search term.' });
        return await interaction.editReply({
          embeds: [embed]
        });
      }

      let radiosList = [];
      for (let i = 0; i < radios.length; i++) {
        radiosList.push(`${i + 1}. ${radios[i].name}\n`);
      }

      embed.setDescription(`**I have found these radio stations:**\n\n${radiosList.join('')}`)
        .setFooter({ text: 'Select the one you want by responding with corresponding number' });
      return interaction.editReply({
        embeds: [embed]
      })
        .then(() => {
          interaction.channel.awaitMessages({
            filter: (m) => m.author.id === interaction.user.id,
            max: 1,
            time: 10000,
            errors: ['time'],
          })
            .then(async (collected) => {
              const message = collected.first();
              await message.delete();

              const connection = joinVoiceChannel({
                channelId: interaction.member.voice.channelId,
                guildId: interaction.guildId,
                selfDeaf: false,
                adapterCreator: interaction.channel.guild.voiceAdapterCreator,
              });
              const player = createAudioPlayer();
              const resource = createAudioResource(radios[message.content - 1].url);
              connection.subscribe(player);
              connection.on(VoiceConnectionStatus.Ready, () => {
                player.play(resource);
              });
              connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
                try {
                  await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                  ]);
                } catch (error) {
                  connection.destroy();
                  embed.setDescription(`There was an error playing the radio station **${radios[message.content - 1].name}**.`)
                    .setFooter({ text: 'Try again or contact my owner.' });
                  await interaction.editReply({
                    embeds: [embed]
                  });
                }
              });
              player.on('error', async (error) => {
                console.error(`Error: ${error.message} with resource ${error.resource.metadata.title}`);
                embed.setDescription(`There was an error playing the radio station **${radios[message.content - 1].name}**.`)
                  .setFooter({ text: 'Try again or contact my owner.' });
                await interaction.editReply({
                  embeds: [embed]
                });
              });
              player.on(AudioPlayerStatus.Playing, async () => {
                embed.setDescription(`The request radio station **${radios[message.content - 1].name}** has started playing!`)
                  .setFooter({ text: '' });
                await interaction.editReply({
                  embeds: [embed]
                });
              });
              player.on('idle', async () => {
                connection.destroy();
                embed.setDescription(`The radio station **${radios[message.content - 1].name}** has stopped playing!`)
                  .setFooter({ text: '' });
                await interaction.editReply({
                  embeds: [embed]
                });
              });
            })
            .catch(async () => {
              embed.setDescription('I waited over 10 seconds but had no response.')
                .setFooter({ text: 'Please response within 10 seconds with the corresponding number.' });
              await interaction.editReply({
                embeds: [embed]
              });
            });
        })
        .catch(async () => {
          embed.setDescription(`There was some sort of error!`)
            .setFooter({ text: 'Please contact my owner.' });
          await interaction.editReply({
            embeds: [embed]
          });
        });
    }

    const queue = await client.player.createQueue(interaction.guild, { autoSelfDeaf: false, spotifyBridge: true });
    if (!queue.connection) {
      await queue.connect(interaction.member.voice.channel);
    }

    if (interaction.options.getSubcommand() === 'song') {
      let url = interaction.options.getString('url');
      const result = await client.player.search(url, {
        requestedBy: interaction.user,
        searchEngine: QueryType.YOUTUBE_VIDEO,
      });
      if (result.tracks.length === 0) {
        return await interaction.editReply(`Sorry, there are no results for the url **${url}**.`);
      }

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
        return await interaction.editReply(`Sorry, there are no results for the url **${url}**.`);
      }

      const playlist = result.playlist;

      let duration = 0;
      result.tracks.forEach((track) => {
        duration = duration + parseInt(track.duration.split(':')[0]);
      });

      const hoursAndMinutes = Math.round((duration / 60) * 100) / 100;
      const hours = Math.round(hoursAndMinutes);
      const minutes = Math.floor((Math.round((hoursAndMinutes % 1) * 100) / 100) * 60);

      await queue.addTracks(result.tracks);
      embed.setDescription(`**${result.tracks.length} songs from [${playlist.title}](${playlist.url})** have been added to the Queue`)
        .setThumbnail(playlist.thumbnail)
        .setFooter({ text: `Duration: ${hours}h ${minutes}m` });

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
      embed.setDescription(`${song.title} has been added to the queue!`)
        .setThumbnail(song.thumbnail)
        .setFooter({ text: `Duration: ${song.duration}` });
    }

    if (!queue.playing) {
      await queue.play();
    }

    client.player.on('trackStart', (queue, track) => {
      let interval = setInterval(async (queue, track) => {
        const playerTimestamp = queue.getPlayerTimestamp();
        const customProgressBar = splitBar(100, playerTimestamp.progress, 25);

        embed.setDescription(`Now playing **${track.title}**\n\n${customProgressBar[0]}\n\n${playerTimestamp.current} - ${playerTimestamp.end}`)
          .setThumbnail(track.thumbnail)
          .setFooter({ text: '' });

        await interaction.editReply({
          embeds: [embed]
        });
      }, 1000, queue, track);

      client.player.on('trackEnd', () => {
        clearInterval(interval);
      });
    });

    await interaction.editReply({
      embeds: [embed]
    });
  }
}
