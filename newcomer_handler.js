const Discord = require("discord.js");
const cluster = require("cluster");

const client = new Discord.Client();

function get_timestamp() {
    var date = new Date();
    return `[${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}:${date.getMilliseconds()}]`;
}

// Setting up console.log and console.err stuff
(function(){
    var _log = console.log;
    var _error = console.error;

    console.error = function(errMessage){
        process.stderr.write(get_timestamp() + "(Manager): ");
        _error.apply(console,arguments);
    };

    console.log = function(logMessage){
        process.stdout.write(get_timestamp() + "(Manager): ");
        _log.apply(console,arguments);
    };
})();


client.on("ready", () => {});

// This handles whenever someone joins the server
client.on("guildMemberAdd", (member) => {
    if (member.user.bot) return; // Ignore bots

    // Plan A - Slide in those DMs
    member.createDM().then(async (dm_channel) => {
        await dm_channel.send("Hello, I am a bot that lives on the server you just joined. We run a relatively tight ship so I would kindly ask you, in your next message to me, to identify yourself so the admins know who you are! Once when you've done that, I'll let you into the server! Thank you <3")
        .then(async () => {
            await dm_channel.awaitMessages(m => m.author.id == member.user.id, {max: 1})
            .then(async (collected) => { // Posting the identification message in the log
                await client.channels.fetch("783400602247757867").then(async (identification_log) => {
                    await identification_log.send(`<@${member.id}> identified him/herself with:\n> ${collected.first().content}`);
                });
            })
            .then(async () => { // Adding the role
                await member.guild.roles.fetch("771956823321739294").then(async (role) => {
                    await member.roles.add(role, "Added role to new person").then((member) => {console.log(`Added default role to ${member.displayName}`)});
                }).catch(async (reason) => {
                    await client.channels.fetch("757387785605873675").then((channel) => { // Azazel Chat
                        channel.send(`Failed to add the default role to newcomer named ${member.displayName}`);
                    }).catch(reason => {
                        console.error("Auto role adder failed multiple times.");
                    });
                });
            });
        });
    }).catch(async (reason) => {
        if (reason.code == Discord.Constants.APIErrors.CANNOT_MESSAGE_USER) {

            // Plan B - Use the identification channel
            await client.channels.fetch("783383349552480276") // new-arrivals channel
            .then((new_arrivals) => {
                new_arrivals.createOverwrite(member, {SEND_MESSAGES: true, VIEW_CHANNEL: true}, "vetting identification system")
                .catch((error) => console.error(error))
                .then(async () => {
                    await new_arrivals.send(`Hello <@${member.id}> and welcome to our server! I'm Lil Stripey Jr, and I noticed that you have disabled DMs from me so here's where we'll do business. We like to run a relatively tight ship here so I would kindly ask you, in your next message, to identify who you are. Once when you do that, you'll have access to the server! Thank you <3`)
                    .then(async () => {
                        await new_arrivals.awaitMessages(m => m.author.id == member.user.id, {max: 1})
                        .then(async (collected) => {
                            await client.channels.fetch("783400602247757867").then(async (identification_log) => {
                                await identification_log.send(`<@${member.id}> identified him/herself with:\n> ${collected.first().content}`);
                            });
                        });
                    });
                }).then(async () => {
                    await new_arrivals.updateOverwrite(member, {SEND_MESSAGES: false, VIEW_CHANNEL: false}, "vetting identification system")
                    .then(async () => { // Adding the role
                        await member.guild.roles.fetch("771956823321739294").then(async (role) => {
                            await member.roles.add(role, "Added role to new person").then((member) => {console.log(`Added default role to ${member.displayName}`)});
                        });
                    });
                });
            });
        } else {
            client.users.fetch("245242590503370753", true).then((me) => {
                me.dmChannel.send(`Failed to add role to newcomer: ${reason}`);
            })
        }
    }).catch((reason) => {
        console.error(`there was an error in the new person identification system: ${reason}`);
    });

    // // This is the fall back plan
    // member.guild.roles.fetch("771956823321739294").then(async (role) => {
    //     member.roles.add(role, "added role to newcomer");
    // });
});

client.login(process.env["login_token"]);
