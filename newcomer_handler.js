const Discord = require("discord.js");
const cluster = require("cluster");

const client = new Discord.Client();

const special_users = process.env["special_users"];

const new_arrivals_channel_id = "783383349552480276";
const identification_log_channel_id = "783400602247757867";
const newcomer_role_id = "771956823321739294"; 

// ========================= FUNCTIONS =========================

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

// ========================= EVENT LISTENERS =========================

client.on("ready", () => {});

// This handles whenever someone joins the server
client.on("guildMemberAdd", (member) => {
    if (member.user.bot) return; // Ignore bots
          
    let addedRole = false;

    // Plan A - Slide in those DMs
    member.createDM().then(async (dm_channel) => {
        await dm_channel.send("Hello, I am a bot that lives on the server you just joined. We run a relatively tight ship so I would kindly ask you, in your next message to me, to identify yourself so the admins know who you are! Once when you've done that, I'll let you into the server! Thank you <3")
        .then(async () => {
            await dm_channel.awaitMessages(m => m.author.id == member.user.id, {max: 1})
            .then(async (collected) => { // Posting the identification message in the log
                await client.channels.fetch(identification_log_channel_id, true)
                .then(async (identification_log) => { // post the identification message in the log
                    await identification_log.send(`<@${member.id}> identified him/herself with:\n> ${collected.first().content}`);
                });
            })
            .then(async () => { // Adding the role
                await member.guild.roles.fetch(newcomer_role_id, true).then(async (role) => {
                    await member.roles.add(role, "Added role to new person").then((member) => {console.log(`Added default role to ${member.displayName}`)});
                }).then(() => {
                    addedRole = true;
                }).catch(async (reason) => {
                    console.error("Auto role adder failed multiple times.");
                });
            });
        });
    }).catch(async (reason) => {
        if (reason.code == Discord.Constants.APIErrors.CANNOT_MESSAGE_USER) { // This means we cannot DM the person

            // Plan B - Use the identification channel
            await client.channels.fetch(new_arrivals_channel_id, true)
            .then((new_arrivals) => {
                new_arrivals.createOverwrite(member, {SEND_MESSAGES: true, VIEW_CHANNEL: true}, "vetting identification system")
                .catch((error) => console.error(error))
                .then(async () => {
                    await new_arrivals.send(`Hello <@${member.id}> and welcome to our server! I'm Lil Stripey Jr, and I noticed that you have disabled DMs from me so here's where we'll do business. We like to run a relatively tight ship here so I would kindly ask you, in your next message, to identify who you are. Once when you do that, you'll have access to the server! Thank you <3`)
                    .then(async () => {
                        await new_arrivals.awaitMessages(m => m.author.id == member.user.id, {max: 1})
                        .then(async (collected) => {
                            await client.channels.fetch(identification_log_channel_id, true)
                            .then(async (identification_log) => {
                                await identification_log.send(`<@${member.id}> identified him/herself with:\n> ${collected.first().content}`);
                            });
                        });
                    });
                }).then(async () => {
                    await new_arrivals.updateOverwrite(member, {SEND_MESSAGES: false, VIEW_CHANNEL: false}, "vetting identification system")
                    .then(async () => { // Adding the role
                        await member.guild.roles.fetch(newcomer_role_id, true).then(async (role) => {
                            await member.roles.add(role, "Added role to new person")
                            .then((member) => {console.log(`Added default role to ${member.displayName}`)})
                            .then(() => {addedRole = true;});
                        });
                    });
                });
            });
        } else {
            for (const id of special_users.developer) {
                client.users.fetch(id, true).then((dev) => {
                    dev.dmChannel.send(`Failed to add role to newcomer: ${reason}`);
                });
            }
        }
    }).catch((reason) => {
        console.error(`there was an error in the new person identification system: ${reason}`);
    });

    // // This is the fall back plan
    // member.guild.roles.fetch(newcomer_role_id).then(async (role) => {
    //     member.roles.add(role, "added role to newcomer");
    //     addedRole = true;
    // });
    
    if (addedRole) {
        client.channels.fetch("779852310649372723", true)
        .then(async (general_chat) => {
            await general_chat.send(`Welcome to the server <@${member.id}>! Be sure to read <#750976189400875028> and enjoy your stay!`);
        });
    }
});

// ========================= MAIN =========================

client.login(process.env["login_token"]);
