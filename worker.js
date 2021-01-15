const Discord = require("discord.js");
const cluster = require("cluster");
const random_number = require("random-number-csprng");
const fs = require("fs");
const https = require("https");

const client = new Discord.Client();

var last_ronin_monologues_used = [];

function get_timestamp() {
    var date = new Date();
    return `[${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}:${date.getMilliseconds()}]`;
}

(function(){
    var _log = console.log;
    var _error = console.error;

    console.error = function(errMessage){
        process.stderr.write(get_timestamp() + `(Worker #${cluster.worker.id}): `);
        _error.apply(console,arguments);
    };

    console.log = function(logMessage){
        process.stdout.write(get_timestamp() + `(Worker #${cluster.worker.id}): `);
        _log.apply(console,arguments);
    };
})();

function send_ready() {
    var stuff = {message: "ready!",  callback: (error) => { console.log(`Error occurred in worker #${cluster.worker.id} when sending ready message: ${error}.\nWill retry in 20 seconds.`); }};
    if (!process.send(stuff)) {
        var interval = setInterval(() => {
            if (process.send(stuff)) { // sending message succeeded
                clearInterval(interval);
            } else {
                console.log(`${cluster.worker.id}: error in sending ready.`);
            }
        }, 1000 * 20);
    }
}

function send_update_commands(change_made, new_commands) {
    var payload = {message: "update-command-list", change: change_made, new_commands: new_commands};
    if (!process.send(payload)) {
        var interval = setInterval(() => {
            if (process.send(payload)) { // sending message succeeded
                clearInterval(interval);
            } else {
                console.log(`${cluster.worker.id}: error in sending ready.`);
            }
        }, 1000 * 20);
    }
}

const commands = {
    "image-post": async function(payload) {
        let culprit = payload.culprit;
        await client.channels.fetch(culprit.channelID).then(async (channel) => {
            await channel.send(`Courtesy of <@${culprit.authorID}>`, new Discord.MessageAttachment(payload.image_path))
            .catch((reason) => {
                return {"message": reason, "channel": channel};
            });
        }, (reason) => {
            channel.send(`<@${culprit.userID}> I'm sorry but there was an error that occurred. The programmer is probably at fault here :/`);
            console.error(reason);
        });
    },
    "text-post": async function(payload) {
        let culprit = payload.culprit;
        await client.channels.fetch(culprit.channelID).then(async (channel) => {
            await channel.send(payload.text)
            .catch((reason) => {
                channel.send(`<@${culprit.userID}> I'm sorry but there was an error that occurred. The programmer is probably at fault here :/`);
                console.error(reason);
            });
        });
    },
    "ronin-text-post": async function(payload) {
        let culprit = payload.culprit;
        await client.channels.fetch(culprit.channelID).then((channel) => (function (channel) {
            return new Promise((resolve,reject) => {
                channel.startTyping();
                new Promise((resolve,reject) => {
                    var output = 0;
                    fs.createReadStream(`${payload.text_path}`)
                    .setEncoding("utf-8")
                    .on("data", (chunk) => {
                        for (let i = 0; i < chunk.length; i++) {
                            if (chunk.charCodeAt(i) == 10) output++; // 10 is \n
                        }
                    }).on("close", () => {
                        resolve(output);
                    });
                }).then(async (n) => {
                    new Promise(async (resolve,reject) => {
                        var num = 0;
                        do {
                            num = await random_number(0, n - 1);
                        } while (last_ronin_monologues_used.includes(num));
                        resolve(num);
                        if (last_ronin_monologues_used.length == Math.floor(n / 2)) {
                            delete last_ronin_monologues_used[0];
                        }
                        last_ronin_monologues_used.push(num);
                    })
                    .catch((reason) => {
                        console.error(`Error in generating random number. Maximum ${n}`);
                    }).then((maximum) => (function(num) {
                        console.log(`Monologue ${num} selected`);
                        return new Promise((resolve,reject) => {
                            var residue = "";
                            fs.createReadStream(payload.text_path)
                            .setEncoding("UTF-8")
                            .on("data", (chunk) => {
                                for (let i = 0; i < chunk.length; i++) {
                                    if (num == 0) {
                                        residue += chunk[i];
                                    } else if (num <= -1) {
                                        break;
                                    }
                                    if (chunk.charCodeAt(i) == 10) {
                                        num--;
                                    }
                                }
                            }).on("close", () => {
                                resolve(residue);
                            });
                        });
                    })(maximum)).then((text) => (function (text) {
                        console.log(`Waiting for ${text.length * (1/190)} minute(s)`);
                        return new Promise((resolve,reject) => {
                            setTimeout(() => {
                                reject(text);
                            }, (60000/200) * text.length);
                        });
                    })(text)).then(() => {},(text) => {
                        channel.stopTyping();
                        channel.send(text).catch((reason) => {
                            if (reason.code == Discord.Constants.APIErrors.CANNOT_SEND_EMPTY_MESSAGE) {
                                console.error(`Apparently sent an empty message: ${text}`);
                            }
                        });
                    });
                });
            });
        })(channel), (reason) => {
            console.error(reason);
        });
    },
    "ferret-fact-post": async function(payload) {
        let culprit = payload.culprit;
        await client.channels.fetch(culprit.channelID).then(async (channel) => {
            await new Promise((resolve, reject) => {
                new Promise((resolve,reject) => {
                    var output = 0;
                    fs.createReadStream(`${payload.text_path}`)
                    .setEncoding("utf-8")
                    .on("data", (chunk) => {
                        for (let i = 0; i < chunk.length; i++) {
                            if (chunk.charCodeAt(i) == 10) output++;
                        }
                    }).on("close", () => {
                        resolve(output);
                    });
                }).then(async (n) => {
                    new Promise(async (resolve,reject) => {
                        var num = await random_number(0, n - 1);
                        resolve(num);
                    })
                    .catch((reason) => {
                        console.error(`Error in generating random number. Maximum ${n}`);
                    }).then((maximum) => (function(num) {
                        console.log(`Ferret Fact ${num} selected`);
                        return new Promise((resolve,reject) => {
                            var residue = "";
                            fs.createReadStream(payload.text_path)
                            .setEncoding("UTF-8")
                            .on("data", (chunk) => {
                                for (let i = 0; i < chunk.length; i++) {
                                    if (num == 0) {
                                        residue += chunk[i];
                                    } else if (num <= -1) {
                                        break;
                                    }
                                    if (chunk.charCodeAt(i) == 10) {
                                        num--;
                                    }
                                }
                            }).on("close", () => {
                                resolve(residue);
                            });
                        });
                    })(maximum)).then((text) => {
                        channel.send(text).catch((reason) => {
                            if (reason.code == Discord.Constants.APIErrors.CANNOT_SEND_EMPTY_MESSAGE) {
                                console.error(`Apparently sent an empty message: ${text}`);
                            }
                        });
                    });
                }).then(() => {resolve();});
            });
        });
    },
    "add-command": async function(payload) {
        let culprit = payload.culprit;
        let command_name = payload.command_name.toLowerCase();
        let command_type = payload.command_type.toLowerCase();
        let extra = payload.extra;
        await client.channels.fetch(culprit.channelID).then(async (channel) => {
            switch (command_type) {
                case "image-post":
                    let save_image_path = payload.save_image_path;
                    let image_url = payload.image_url;
                    await new Promise((resolve, reject) => {
                        https.get(image_url, (response) => {response.pipe(fs.createWriteStream(save_image_path)).on("close", () => {resolve();})});
                    }).then(() => {
                        let commands = require(__dirname + "/commands.json");
                        if (commands[`!${command_name}`] != undefined) {
                            channel.send(`<@${culprit.authorID}> that command already exists.`);
                        } else {
                            commands[`!${command_name}`] = {
                                "regex": {
                                    "pattern": `!${command_name}(?:$| )`,
                                    "flags": "im"
                                },
                                "payload": {
                                    "message": `${command_type}`,
                                    "image_path": `${save_image_path}`
                                },
                                "enabled": true,
                                "blacklist": [],
                                "admin": false
                            };
                            send_update_commands(`${culprit.authorID} added an ${command_type} command called !${command_name}`, commands);
                            fs.writeFileSync(__dirname + "/commands.json", JSON.stringify(commands));
                            channel.send(`<@${culprit.authorID}> The command was added successfully!`);
                        }
                    }).catch((reason) => {
                        channel.send(`<@${culprit.authorID}> There was an error in adding the command. Check the logs for more info.`);
                        console.error(reason);
                    });
                    break;
                case "text-post":
                    let commands = require(__dirname + "/commands.json");
                    if (commands[`!${command_name}`] != undefined) {
                        channel.send(`<@${culprit.authorID}> that command already exists.`);
                    } else {
                        commands[`!${command_name}`] = {
                            "regex": {
                                "pattern": `!${command_name}(?:$| )`,
                                "flags": "im"
                            },
                            "payload": {
                                "message": `${command_type}`,
                                "text": `${extra}`
                            },
                            "enabled": true,
                            "blacklist": []
                        };
                        fs.writeFileSync(__dirname + "/commands.json", JSON.stringify(commands));
                        send_update_commands(`${culprit.authorID} added an ${command_type} command called !${command_name}`, commands);
                        channel.send(`The command was added successfully!`);
                    }
                    break;
                default:
                    break;
            }
        });
    },
    "remove-command": async function(payload) {
        let culprit = payload.culprit;
        let command_name = payload.command_name.toLowerCase();
        await client.channels.fetch(culprit.channelID).then(async (channel) => {
            try {
                let commands = require(__dirname + "/commands.json");
                let command = commands[`!${command_name}`];
                if (command.admin || command_name == "help") {
                    channel.send(`<@${culprit.authorID}>, you cannot remove an admin/essential command.`);
                    return;
                } else {
                    switch (command.payload.message) {
                        case "image-post":
                            fs.unlinkSync(command.payload.image_path);
                            delete commands[`!${command_name}`];
                            fs.writeFileSync(__dirname + "/commands.json", JSON.stringify(commands));
                            send_update_commands(`${culprit.authorID} removed !${command_name}`, commands);
                            channel.send("Successfully deleted command");
                            break;
                        case "text-post":
                            delete commands[`!${command_name}`];
                            fs.writeFileSync(__dirname + "/commands.json", JSON.stringify(commands));
                            send_update_commands(`${culprit.authorID} removed !${command_name}`, commands);
                            channel.send("Successfully deleted command");
                            break;
                        default:
                            console.error(`Unknown command type ${command.payload.message}`);
                            channel.send(`<@${culprit.authorID}> I could not delete that command because the programmer hasn't implemented a way of deleting it yet. Use !disablecommand as a temporary fix.`);
                            break;
                    }
                }
            } catch (e) {
                channel.send(`<@${culprit.authorID}>, there was an error in deleting the command.`);
                console.error(e);
            }
        });
    },
    "cursify": async function (payload) {
        let culprit = payload.culprit;
        let text = payload.text;
        await client.channels.fetch(culprit.channelID).then(async (channel) => {
            var output = "";
            for (const letter of text) {
                output += letter;
                var used_chars = [];
                while (used_chars.length < 10) {
                    await random_number(0x300, 0x36F).then((number) => {
                        if (!used_chars.includes(number)) {
                            output += String.fromCharCode(number);
                            used_chars.push(number);
                        }
                    });
                }
            }
            channel.send(output);
        });
    },
    "cheemsify": async function (payload) {
        let culprit = payload.culprit;
        let text = payload.text;
        await client.channels.fetch(culprit.channelID).then(async (channel) => {
            var exceptions = {
                bad: "bamd",
                batman: "bamtman",
                cheeseburger: "cheemsburger",
                motherfucker: "momtherfumcker",
                walter: "walmter"
            };
            
            var words = text.match(/(\S+)/gm);
            var output = [];
            for (const word of words) {
                var skip = false;
                for (const exception in exceptions) {
                    var match = word.match(new RegExp(`\\b${exception}\\b`, "im"));
                    if (match != null) {
                        skip = true;
                        output.push((match[1] == undefined ? "" : match[1]) + exceptions[exception] + (match[2] == undefined ? "" : match[2]));
                        break;
                    }
                }
                if (skip) continue;
                if (word.length < 4) {
                    output.push(word);
                    continue;
                }
                
                const regex_pattern = /([A-z]*?)(?:(?<!m)(?=[aeiou]+[^m])([aeiou]+)(?=[^l]{1,})(?:([w]+?|(?=r[^aeiou])r))?)(\S+)/im;
                const replace = "$1$2$3m$4";
                var cheems_word = word.replace(regex_pattern, replace);
                output.push(cheems_word);
            }
            channel.send(output.join(" "));
        });
    }
};

process.on("message", async (payload) => {
    for (const key in commands) {
        if (payload.message == key) {
            commands[key](payload).catch((reason) => { // signal the manager this worker is ready
                console.error(reason);
            });
        }
    }
    send_ready();
});

client.on("shardError", (error) => { // This is run when there's a websocket error
    console.log(error.reason);
    switch (error.code) {
        case "ENOTFOUND": // Unable to resolve the server, sooo probably internet connection issues
            console.error("Was unable to connect to the internet");
            break;
        default:
            console.error(`Unknown shard error code: ${error.code}`);
    }
});

client.on("ready", () => {});

client.login(process.env["login_token"])
.catch((error) => {
    switch (error.code) {
        case 400: // Bad request

            break;
        case 50014: // Bad authentication token
            
            break;
        case 1300: // API Resource is overloaded, try again later
            break;
        default:
            console.error(error);
            break;
    }
}).then(send_ready);
