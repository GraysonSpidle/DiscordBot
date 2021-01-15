const Discord = require("discord.js");
const cluster = require("cluster");
const random_number = require("random-number-csprng");
const fs = require("fs");

const client = new Discord.Client();

var temp = require("/home/pi/DiscordBot/letter_data.json");
var previous_words_path = __dirname + "/wotds.txt";

var data = temp.data;
var lengths = temp.lengths;
var wordOfTheDay = "";

function get_timestamp() {
    var date = new Date();
    return `[${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}:${date.getMilliseconds()}]`;
}

(function(){
    var _log = console.log;
    var _error = console.error;

    console.error = function(errMessage){
        process.stderr.write(get_timestamp() + `(WOTD Handler): `);
        _error.apply(console,arguments);
    };

    console.log = function(logMessage){
        process.stdout.write(get_timestamp() + `(WOTD Handler): `);
        _log.apply(console,arguments);
    };
})();

async function rand_pick(data) {
    var n = 0;
    for (const key in data) {
        n += data[key];
    }
    var i = await random_number(1, n);
    var total = 0;
    for (const key in data) {
        total += data[key];
        if (i <= total) {
            return key;
        }
    }
}

async function build_word(data, lengths) {
    var length = await rand_pick(lengths);
    var word = "" + String.fromCharCode(await random_number(97,97+26));
    while (word.length < length) {
        var picked = '\n';
        do {
            picked = await rand_pick(data[word[word.length - 1]]);
        } while (picked == '\n');
        word += picked;
    }
    return word;
}

async function announce_wotd() {
    wordOfTheDay = await build_word(data,lengths);
    wordOfTheDay = wordOfTheDay[0].toUpperCase() + wordOfTheDay.slice(1);
    fs.appendFileSync(previous_words_path, wordOfTheDay + "\n");
    await client.channels.fetch("779852310649372723").then(async (channel) => {
        await channel.send(`Greetings everyone! Today's Word of the Day is: ${wordOfTheDay}.`);
    });
}

client.on("ready", () => {});

var wotd_announcement;
var now = new Date();
var until7am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 0, 0, 0) - now;
if (until7am < 0) {
    until7am += 86400000;
}
setTimeout(() => {
    announce_wotd();
    wotd_announcement = setInterval(() => {announce_wotd()}, 86400000);
}, until7am);
    
client.login(process.env["login_token"]);



