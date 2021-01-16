const Discord = require("discord.js");
const cluster = require("cluster");
const fs = require("fs");
const Pagination = require('discord-paginationembed');
var nodemon = require("nodemon");

cluster.schedulingPolicy = cluster.SCHED_NONE;

const client = new Discord.Client();

const login_token = require(__dirname + "/login_token.json").token;

var numCPUs = require("os").cpus().length;
var worker_availability = {};
var newcomer_handler = null;
var wotd_handler = null;

var commands = require(__dirname + "/commands.json");

const special_users = require(__dirname + "/special_users.json");

var blacklist = require(__dirname + "/blacklist.json");

// ===================== FUNCTIONS =====================

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

function send_payload(payload) {
    /** Sends the payload to the first available worker */
    return new Promise((resolve,reject) => {
        function func() {
            for (const id in cluster.workers) {
                if (worker_availability[id]) {
                    cluster.workers[id].send(payload);
                    worker_availability[id] = false;
                    console.log(`Sent Worker #${id} a ${payload.message} task.`);
                    return true;
                }
            }
            return false;
        }
        if (!func()) {
            // If we don't find an available worker, then we just retry until we find one.
            var interval = setInterval(() => { if(func()) {clearInterval(interval);resolve(payload)} }, 100);
        } else {
            resolve(payload);
        }
    });
}

async function cleanup() {
    client.destroy();
    for (const id in cluster.workers) {
        shutdown_promises.push(new Promise((resolve,reject) => {
            cluster.workers[id].kill(); // Tries to gracefully kill the worker
            setTimeout(() => {
                if (cluster.workers[id] != undefined && !cluster.workers[id].isDead()) {
                    console.log(`Slaughtering Worker ${id} for being too slow to shutdown.`)
                    cluster.workers[id].process.kill("SIGKILL"); // Ungracefully kills the process
                }
                resolve();
            }, 3000);
        }));
    }
    await Promise.all(shutdown_promises)
    .then((() => {
        return new Promise((resolve,reject) => {
            cluster.disconnect(() => resolve());
        });
    })());
}

async function admin_help(message) {
    let elements_array = [];
    for (const key in commands) {
        if (!commands[key].admin || !commands[key].enabled) continue;
        elements_array.push({name: `**${key}** ${commands[key].syntax}`});
    }

    const FieldsEmbed = new Pagination.FieldsEmbed()
    .setArray(elements_array)
    .setAuthorizedUsers(special_users.developer.concat([message.author.id]))
    .setChannel(message.channel)
    .setElementsPerPage(5)
    .setPage("back")
    .setDeleteOnTimeout(true)
    .setTimeout(2 * 60 * 1000) // 2 minutes
    .setPageIndicator(true)
    .formatField("Name", i => i.name);

    FieldsEmbed.embed
    .setDescription("**Admin Help Menu**\nPress the < > and ^ reactions to navigate through pages.");

    await FieldsEmbed.build();
}

function blacklist_users(message, match_arr) {
    /** Blacklists users (duh) */
    
    let command_name = match_arr.groups["command_name"];
    let ids = message.mentions.users // getting mentioned users first
    .filter((value, key) => { // disable the ability to blacklist yourself from a command
        return message.author.id != key;
    })
    .filter((value, key) => { // enforce a hierarchy of admins of who can blacklist who from a command
        if (special_users.developer.includes(message.author.id)) {
            return true;
        } else if (special_users.super_admins.includes(message.author.id)) {
            return !special_users.super_admins.includes(key);
        } else {
            return !special_users.admins.includes(key);
        }
    })
    .filter((value, key) => { // ensure that the user isn't already blacklisted
        return !(command_name in blacklist) || !blacklist[command_name].includes(key);
    })
    .keyArray();
    
    // now getting the unique ids that could've been pasted in a comma delimited list
    for (const id of match_arr.groups["ids"].match(/(\d+),? ?/g)) {
        if (ids.includes(id)) continue;
        ids.push(id);
    }
    
    // Now we'll add the users to the blacklist
    for (let i = 0; i < ids.length; i++) {
        if (!(command_name in blacklist)) {
            blacklist[command_name] = [];
        }
        blacklist[command_name].push(ids[i]);
    }
    
    if (ids.length) {
        fs.writeFileSync(__dirname + "/blacklist.json", JSON.stringify(blacklist)); // Write the changes to the file
        message.reply(`Blacklisted ${ids.length} people.`);
        console.log(`${message.author.username}(${message.author.id}) blacklisted ${ids} from using ${command_name}`);
    } else { // ids.length == 0
        message.reply("Blacklisted no one.");
    }
}

function unblacklist_users(message, match_arr) {
    let command_name = match_arr.groups["command_name"];
    let ids = message.mentions.users
    .filter((value,key) => {
        return !(command_name in blacklist) || !blacklist[command_name].includes(key);
    })
    .keyArray();
    
    // now getting the unique ids that could've been pasted in a comma delimited list
    for (const id of match_arr.groups["ids"].match(/(\d+),? ?/g)) {
        if (ids.includes(id)) continue;
        ids.push(id);
    }
    
    // Now we'll remove the users from the blacklist
    for (let i = 0; i < ids.length; i++) {
        let index = blacklist[command_name].indexOf(ids[i]);
        delete blacklist[command_name][index];
    }
    
    if (ids.length) {
        fs.writeFileSync(__dirname + "/blacklist.json", JSON.stringify(blacklist));
        message.reply(`Unblacklisted ${ids.length} people.`);
        console.log(`${message.author.username}(${message.author.id}) unblacklisted ${ids} from using ${command_name}`);
    } else { // ids.length == 0
        message.reply("Unblacklisted no one.");
    }
}

async function shutdown(message) {
    if (special_users.admins.includes(message.author.id)) {
        console.log(`${message.author.username}(${message.author.id}) initiated a shutdown.`);
        for (const developer of special_users.developer) { // Notify the developers that a shutdown has been initiated
            await client.users.fetch(developer).then(async (user) => {
            await user.createDM().then(async (dm_channel) => {
                await dm_channel.send(`${message.author.username}(${message.author.id}) initiated a shutdown.`).catch((reason) => console.error(`Couldn't send dad a DM because: ${reason}`));
                });
            });
        }
        await message.reply("Authorization confirmed.");
        process.exit();
    } else {
        message.reply("Invalid authorization: Access denied");
        console.log(`Username ${message.author.username} with id ${message.author.id} attempted a shutdown in #${message.channel.name}.`);
    }
}

function add_command(message, match_arr, payload) {
    for (const key in match_arr.groups) {
        payload[key] = match_arr.groups[key];
    }
    switch (match_arr.groups["command_type"]) {
        case "image-post":
            if (message.attachments.array().length < 1) {
                message.reply("Invalid Syntax: must supply an image.");
                break;
            }
            let image = message.attachments.array()[0];

            payload.save_image_path = __dirname + `/images/${match_arr.groups["command_name"]}${image.name.match(/\..+$/im)}`;
            payload.image_url = image.attachment;
            
            send_payload(payload);
            break;
        case "text-post":
            send_payload(payload);
            break;
        default:
            break;
    }
}

function disable_command(message, match_arr) {
    let command_name = `!${match_arr.groups["command_name"]}`;
    if (commands[command_name].admin || command_name == "help") {
        message.reply("You cannot disable admin/essential commands.");
        break;
    }
    commands[command_name].enabled = false;
    try {
        fs.writeFileSync(__dirname + `/commands.json`, JSON.stringify(commands, null, 2));
        message.reply("Disabled the command successfully.");
    } catch (e) {
        message.reply("There was an error in disabling the command.");
    }
}

// ========================== EVENT LISTENERS ========================== 

// This handles the messages the workers send to the manager.
cluster.on("message", (worker, message) => {
    switch (message.message) {
        case "ready!": // This is the receiver for the manager for when the workers become available.
            worker_availability[worker.id] = true;
            console.log(`Worker ${worker.id} is ready.`);
            break;
        case "update-command-list":
            console.log(`Updating command list. Change made: ${message.change}`);
            commands = message.new_commands;
            break;
        default:
            console.log(`Unexpected message: ${message.message}`);
            break;
    }
});

// Whenever a worker comes online, this gets fired.
cluster.on("online", (worker) => {
    // If we add a new worker during runtime, then this will allow the manager to know about it
    switch (worker_availability[worker.id]) {
        case null:
        case undefined:
            worker_availability[worker.id] = false;
            break;
        default:
            break;
    }
});

// Whenever a worker goes offline, this gets fired.
cluster.on("exit", (worker, code, signal) => {
    if (worker_availability.includes(worker.id)) {
        delete worker_availability[worker.id];
        console.log(`Removed worker ${worker.id} because it exited prematurely`);
    }
});

client.on("ready", () => {});

// This handles all the messages that Discord chucks at us
client.on("message", async (message) => {
    if (message.author.bot) return; // Ignore bots

    // Checking if the message is sent to the bot's dms or it actually includes the bot in its mentions.
    var is_mentioned = message.channel.type == "dm" || message.mentions.members.keyArray().includes(client.user.id);

    if (message.content.includes("🏗️")) {
        message.react("🏗️")
        .catch((reason) => {
            // if this fails, whatever.
        });
    }

    if (message.content.includes("🤌")) {
        message.react("🤌")
        .catch((reason) => {});
    }

    // Iterating through all the commands
    for (const key in commands) {
        let command = commands[key];

        if (!command.enabled || (key in blacklist && blacklist[key].includes(message.author.id))) continue;

        var match_arr = message.content.match(new RegExp(command.regex.pattern, command.regex.flags)); // Using regex, we will look for commands
        if (match_arr != null) { // if there's a regex hit.
            var payload = JSON.parse(JSON.stringify(command.payload)); // effectively copying the payload
            payload.culprit = message;
            payload.is_mentioned = is_mentioned;
            
            if (special_users.admins.includes(message.author.id)) { // Admin Commands
                switch (command.payload.message) {
                    case "shutdown":
                        await shutdown(message);
                        return;
                    case "admin-help":
                        if (!is_mentioned) break;
                        admin_help(message);
                        return;
                    case "blacklist":
                        blacklist_users(message, match_arr);
                        return;
                    case "unblacklist":
                        unblacklist_users(message, match_arr);
                        return;
                    case "add-command":
                        add_command(message, match_arr, payload);
                        return;
                    case "remove-command":
                        payload.command_name = match_arr.groups["command_name"];
                        send_payload(payload);
                        return;
                    case "update-commands":
                        commands = require(__dirname + "/commands.json");
                        message.reply("Successfully updated commands");
                        console.log("Commands updated.");
                        return;
                    case "enable-command":
                        commands[`!${match_arr.groups["command_name"]}`].enabled = true;
                        message.reply("Enabled the command successfully.");
                        fs.writeFileSync(__dirname + `/commands.json`, JSON.stringify(commands, null, 2));
                        return;
                    case "disable-command":
                        disable_command(message, match_arr);
                        return;
                    case "ronin-text-post":
                        if (message.channel.id == "757387785605873675") { // Azazel Chat
                            send_payload(payload);
                        }
                        return;
                    case "restart":
                        if (special_users.admins.includes(message.author.id)) {
                            message.reply("Restarting...");
                            fs.writeFileSync(__dirname + `/restartFile.restart`, " ");
                        }
                        return;
                    default:
                        break;
                }
            }
            // Normie Commands
            switch (command.payload.message) {
                case "help":
                    if (!is_mentioned) break;
                    var elements_array = [];
                    for (const key in commands) {
                        if ((commands[key].admin && key != "adminhelp") || !commands[key].enabled || key == "!simulateronin") continue;
                        elements_array.push({name: key});
                    }

                    const FieldsEmbed = new Pagination.FieldsEmbed()
                    .setArray(elements_array)
                    .setAuthorizedUsers(special_users.developer.concat([message.author.id]))
                    .setChannel(message.channel)
                    .setElementsPerPage(10)
                    .setPage("back")
                    .setDeleteOnTimeout(true)
                    .setTimeout(5 * 60 * 1000)
                    .setPageIndicator(true)
                    .formatField("Name", i => i.name);

                    FieldsEmbed.embed
                    .setDescription(`**Help Menu**\n Press the < > and ^ reactions to navigate through pages.\nBe considerate and don't ruin these commands for everyone.`);

                    await FieldsEmbed.build();
                    break;
                case "cursify":
                    payload.text = match_arr.groups["text"];
                    send_payload(payload);
                    break;
                case "cheemsify":
                    payload.text = match_arr.groups["text"];
                    send_payload(payload);
                    break;
                default:
                    send_payload(payload);
                    break;
            }
        }
    }
});


client.on("shardError", (error) => { // No idea what a shard error is
    console.error(`A websocket error has occurred: ${error}`);
});

process.on('uncaughtException', (err) => {
    console.error(err);
    console.log("restarting");
    try {
        fs.writeFileSync(__dirname + `/restartFile.restart`, " ");
    } catch (error) {
        console.error("couldn't restart, shutting down");
        process.exit();
    }
});

process.on("exit", cleanup);

nodemon.on("quit", cleanup);

nodemon.on("restart", cleanup);


// ================================================================================================

var activity_interval = setInterval(() => { // every hour we will make sure our activity is updated.
    client.user.setActivity("@ me with !help or with !adminhelp for admins");
}, 3600000);

console.log("Timestamps are in the format of hh:mm:ss:ms");

console.log(`Creating ${numCPUs - 1} workers...`);

cluster.setupMaster({exec: "worker.js"}); // setting up the cluster.fork() command so it makes workers.

var worker_env = {
    login_token: login_token,
    special_users: special_users
};

// Logging in the discord client
client.login(login_token)
.catch((error) => {
    switch (error.code) {
        // ======= PROBLEMATIC ERRORS =======
        case 400: // Bad Request
            console.error("FATAL Bad request occurred when logging in.");
            process.kill();
            break;
        case Discord.Constants.APIErrors.INVALID_AUTHENTICATION_TOKEN:
            console.error("Check the authentication token and make sure it is valid");
            process.kill();
            break;
        // ======= RETRY ERRORS =======
        case Discord.Constants.APIErrors.RESOURCE_OVERLOADED:
        case 500: // Sometimes it'll throw a 500 error if you aren't connected to the internet
            if (typeof(error.reason) == String && error.reason.match(/getaddrinfo ENOTFOUND .+/i) != null) {
                console.error(`Server error occurred, probably on Discord's end: ${error}`);
                break;
            }
            // If we get here then it probably means that the discordjs api couldn't connect to the internet when attempting its login
        case 404: // Not found (connectivity issues maybe)
        case 408: // Request timed-out
        default:
            console.error(`Unhandled error: ${error}`);
            break;
    }
})
.then(async () => {
    await Promise.all([
        client.user.setStatus("online"),
        client.user.setActivity("@ me with !help or with !adminhelp for admins")
    ]);
})
.then(async () => {
    // Creating the workers
    await new Promise((resolve,reject) => {
        if (!numCPUs) reject("Cannot make less than 1 worker.");

        for (var i = 0; i < numCPUs - 1; i++) {
            let worker = cluster.fork(worker_env);
            worker_availability[worker.id] = false;
        }

        var interval = setInterval(() => {
            if (Object.keys(worker_availability) == 0) {
                console.log("No workers found.");
                process.exit(-1);
            }
            for (const id in cluster.workers) {
                if (!worker_availability[id]) return;
            }
            clearInterval(interval);
            console.log("All workers online!");
            resolve();
        }, 100); // repeat this process every 100 milliseconds until all of them are online
    });
})
.then(() => {
    console.log("Creating newcomer handler...");

    cluster.setupMaster({exec: "newcomer_handler.js"}); // setting up the cluster.fork() command so it makes the newcomer handler
    newcomer_handler = cluster.fork(worker_env);    
})
.then(() => {
    console.log("Creating wotd handler...");
    
    cluster.setupMaster({exec: "wotd_handler.js"});
    wotd_handler = cluster.fork(worker_env);
})
.then(() => console.log("Everything is good to go!"));
