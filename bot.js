const Discord = require('discord.js');
const dotenv = require('dotenv');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const fs = require('fs');
const { Player } = require('discord-player');

dotenv.config();
const TOKEN = process.env.BOT_TOKEN;

const LOAD_SLASH = process.argv[2] === 'load';

const CLIENT_ID = '887304218929672214';
const GUILD_ID = '705163367660126238';

const client = new Discord.Client({
  intents: [
    'GUILDS',
    'GUILD_VOICE_STATES',
    'GUILD_MESSAGES',
  ],
});

client.slashcommands = new Discord.Collection();
client.player = new Player(client, {
  ytdlOptions: {
    quality: 'highestaudio',
    highWaterMark: 1 << 25,
  }
});

const commands = [];

const slashFiles = fs.readdirSync('./slash').filter(file => file.endsWith('.js'));

for (const file of slashFiles) {
  const slashcmd = require(`./slash/${file}`);

  client.slashcommands.set(slashcmd.data.name, slashcmd);
  if (LOAD_SLASH) commands.push(slashcmd.data.toJSON());
}

if (LOAD_SLASH) {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  console.log('Deploying slash commands');
  rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands })
    .then(() => {
      console.log('Successfully loaded');
      process.exit(0)
    })
    .catch((err) => {
      console.log(err);
      process.exit(1);
    });
} else {
  client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
  });
  client.on('interactionCreate', (interaction) => {
    const handleCommand = async () => {
      if (!interaction.isCommand()) return;

      const slashcmd = client.slashcommands.get(interaction.commandName);
      if (!slashcmd) interaction.reply('Not a valid slash command');

      await interaction.deferReply();
      await slashcmd.run({ client, interaction });
    }
    handleCommand();
  });
  client.login(TOKEN);
}
