const fs = require("fs").promises;
const path = require("path");
const cl = require("colors/safe");

process.on("uncaughtException", (error) => {
	log("err", "Uncaught Exception", error);
});

let config = require("./config.json");
let channels = require("./channels.json");

const TwitchClient = require("twitch").default;
const ChatClient = require("twitch-chat-client").default;

const api = TwitchClient.withCredentials(config.clientId, config.token);
const chat = ChatClient.forTwitchClient(api, {
	requestMembershipEvents: false,
});

let channelCount = 0;

function log(type, topic, message) {
	let msg = "";
	switch (type.toLowerCase()) {
	case "info":
		msg = cl.green("[INFO]");
		break;
	case "warn":
	case "warning":
		msg = cl.yellow("[WARN]");
		break;
	case "err":
	case "error":
		msg = cl.red("[ERROR]");
		break;
	}
	console.log(`${msg} ${cl.white(topic)} ${cl.reset(message)}`);
}

const chars = "(?:\\!|\\@|\\#|\\&|\\*|\\(|\\)|\\+|\\-|\\\"|\\,|\\.|\\?|$| |^)";

chat.onPrivmsg(async (c, u, m) => {
	if (
		config.log.chat ||
		(new RegExp(chars + config.userName + chars, "i").test(m) &&
			config.log.mentions)
	)
		log("info", "Message/" + c, `${cl.bold(u)}: ${cl.dim(m)}`);
	if (u === config.userName) {
		let changed = true;
		switch (m) {
		case config.prefix + "status":
			chat.say(
				c,
				`Channels: ${channelCount}, Log: chat = ${config.log.chat}, mentions = ${config.log.mentions}, subs = ${config.log.subs}, resubs = ${config.log.resubs}, subgifts = ${config.log.subgifts}, randomsubgifts = ${config.log.randomsubgifts}, receivedsubgifts = ${config.log.receivedsubgifts}, joins = ${config.log.joins}`
			);
			break;
		case config.prefix + "logchat":
			config.log.chat = !config.log.chat;
			chat.say(c, `${config.log.chat}`);
			break;
		case config.prefix + "logmentions":
			config.log.mentions = !config.log.mentions;
			chat.say(c, `${config.log.mentions}`);
			break;
		case config.prefix + "logsubs":
			config.log.subs = !config.log.subs;
			chat.say(c, `${config.log.subs}`);
			break;
		case config.prefix + "logresubs":
			config.log.resubs = !config.log.resubs;
			chat.say(c, `${config.log.resubs}`);
			break;
		case config.prefix + "logsubgifts":
			config.log.subgifts = !config.log.subgifts;
			chat.say(c, `${config.log.subgifts}`);
			break;
		case config.prefix + "lograndomsubgifts":
			config.log.randomsubgifts = !config.log.randomsubgifts;
			chat.say(c, `${config.log.randomsubgifts}`);
			break;
		case config.prefix + "logreceivedsubgifts":
			config.log.receivedsubgifts = !config.log.receivedsubgifts;
			chat.say(c, `${config.log.receivedsubgifts}`);
			break;
		case config.prefix + "logjoins":
			config.log.joins = !config.log.joins;
			chat.say(c, `${config.log.joins}`);
			break;
		default:
			changed = false;
			break;
		}
		if (changed)
			await fs.writeFile(
				path.resolve(__dirname, "config.json"),
				JSON.stringify(config)
			);
	}
});

chat.onSubGift((c, u, i) => {
	if (
		config.log.subgifts ||
		(config.log.receivedsubgifts && u === config.userName)
	)
		log(
			"warn",
			"Sub Gift/" + c,
			`${i.gifter} gifted subscription to ${u}. ${u} is subscribed for ${i.months} months`
		);
});

chat.onSub((c, u, i) => {
	if (config.log.subs)
		log(
			"warn",
			"Sub/" + c,
			`${u} subscribed for ${i.months} months${
				i.message ? `. Message: ${i.message}` : ""
			}`
		);
});

chat.onSubExtend((c, u, i) => {
	if (config.log.resubs)
		log(
			"warn",
			"Sub Extend/" + c,
			`${u} resubscribed with ${i.planName} for ${i.months} months${
				i.message ? `. Message: ${i.message}` : ""
			}`
		);
});

chat.onCommunitySub((c, u, i) => {
	if (
		config.log.randomsubgifts ||
		(config.log.receivedsubgifts && u === config.userName)
	)
		log(
			"warn",
			"Community Sub/" + c,
			`${i.gifter} randomly gifted subscription to ${u}${
				i.months ? `for ${i.months} months` : ""
			}`
		);
});

async function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

chat.onJoin((c, u) => {
	if (u === config.userName) {
		if (config.log.joins) log("info", "Join", c);
	}
});

let connected = false;

chat.onDisconnect(() => {
	connected = false;
});

chat.onConnect(async () => {
	const connectedLocal = +new Date();
	connected = connectedLocal;
	channelCount = 0;
	for (const channel of channels) {
		if (!connected || connected !== connectedLocal) return;
		chat.join(channel).catch((e) => log("err", "Join Error/" + channel, e));
		channelCount++;
		await sleep(1000);
	}
});

async function updateChannels() {
	for await (const stream of api.helix.streams.getStreamsPaginated()) {
		if (stream.viewers < 300) break;
		const displayName = stream.userDisplayName.toLowerCase();
		if (!/^[A-Za-z_0-9]*$/.test(displayName)) continue;
		if (!channels.includes(displayName)) channels.push(displayName);
		console.log(displayName);
	}
	await fs.writeFile(
		path.resolve(__dirname, "channels.json"),
		JSON.stringify(channels)
	);
}

async function main() {
	await updateChannels();
	chat.connect();
}

main();
