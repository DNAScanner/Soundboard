type UserData = {
	role: "send" | "receive";
};

type User = {
	id: string;
	outgoingMessages: string[];
	data: UserData;
	send: (message: string) => void;
};

const sounds: string[] = [];

const updateSounds = () => {
	sounds.length = 0;
	for (const file of Deno.readDirSync("./client/")) {
		if (file.isFile && file.name.endsWith(".mp3")) sounds.push(file.name.split(".").slice(0, -1).join("."));
	}
};

updateSounds();

(async () => {
	const fsUpdate = Deno.watchFs("./client/");

	for await (const _event of fsUpdate) updateSounds();
})();

const users: User[] = [];

const playSound = (sound: string) => {
	for (const user of users.filter((user) => user.data.role === "receive")) user.send(`playSound:${sound}`);
};

const stopSound = (sound: string) => {
	for (const user of users.filter((user) => user.data.role === "receive")) user.send(`stopSound:${sound}`);
};

const toggleSound = (sound: string) => {
	for (const user of users.filter((user) => user.data.role === "receive")) user.send(`toggleSound:${sound}`);
};

Deno.serve((req: Request) => {
	if (req.headers.get("upgrade") != "websocket") {
		const path = new URL(req.url).pathname;

		switch (path) {
			case "/":
				return new Response(Deno.readTextFileSync("./client/send.html").replace(`["SOUNDS"]`, JSON.stringify(sounds)), {
					headers: {
						"Content-Type": "text/html",
					},
				});

			case "/receive":
				return new Response(Deno.readTextFileSync("./client/receive.html"), {
					headers: {
						"Content-Type": "text/html",
					},
				});

			default:
				try {
					const file = Deno.openSync("./client" + path, {read: true});
					const readableStream = file.readable;

					return new Response(readableStream);
				} catch {
					return new Response("404 Not Found", {
						status: 404,
						headers: {
							"Content-Type": "text/plain",
						},
					});
				}
		}
	}

	const {socket, response} = Deno.upgradeWebSocket(req);

	socket.addEventListener("open", (_req: Event) => {
		let id: string = "";

		while (id.length <= 0 || users.find((user) => user.id === id)) {
			id = Math.random().toString(36).substring(7);
		}

		const self: User = {
			id,
			outgoingMessages: [],
			data: {
				role: "receive",
			},
			send: (message: string) => self.outgoingMessages.push(message),
		};

		users.push(self);

		socket.send(id);

		(async () => {
			while (true) {
				for (const message of self.outgoingMessages) {
					socket.send(message);
					self.outgoingMessages.splice(self.outgoingMessages.indexOf(message), 1);
				}

				await new Promise((resolve) => setTimeout(resolve, 10));
			}
		})();

		socket.addEventListener("close", () => {
			users.splice(users.indexOf(self), 1);
		});

		socket.addEventListener("message", (req: MessageEvent) => {
			if (String(req.data).startsWith("setRole:") && String(req.data).split(":").length === 2) {
				const [_, role] = String(req.data).split(":");

				// Check if the role is valid
				if (role === "send" || role === "receive") self.data.role = role;
			} else if (String(req.data).startsWith("playSound:") && String(req.data).split(":").length === 2) {
				const [_, sound] = String(req.data).split(":");

				// Check if the sound is valid
				playSound(sound);
			} else if (String(req.data).startsWith("stopSound:") && String(req.data).split(":").length === 2) {
				const [_, sound] = String(req.data).split(":");

				// Check if the sound is valid
				stopSound(sound);
			} else if (String(req.data).startsWith("toggleSound:") && String(req.data).split(":").length === 2) {
				const [_, sound] = String(req.data).split(":");

				// Check if the sound is valid
				toggleSound(sound);
			}
		});
	});

	return response;
});
