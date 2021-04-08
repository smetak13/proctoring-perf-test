const fs = require('fs');
const io = require('socket.io-client');
const express = require('express');
const { v4 } = require('uuid');
const argv = require('minimist')(process.argv.slice(2));

const app = express();

app.get('/', (req, res) => {
	res.send('Proctoring performance test server is running!');
});

const SERVER_URL = 'https://api-proxy.proctoring.borndigital.ai';
const DURATION = argv.d ? argv.d * 1000 : 60000;
const CONCURRENT_USERS = argv.c ? argv.c : 1;
const COOLDOWN_PERIOD = 10000;

console.log(`Testing performance for ${CONCURRENT_USERS} concurrent users on server url ${SERVER_URL}.`);

const simulateLoad = async () => {
	const videoChunk = await fs.promises.readFile(`${__dirname}/data/video.webm`, {
		encoding: 'binary',
	});
	const screenChunk = await fs.promises.readFile(`${__dirname}/data/screen.webm`, {
		encoding: 'binary',
	});

	for (let i = 0; i < CONCURRENT_USERS; i++) {
		let examId;
		const externalExamId = 'external-id';
		const definitionId = 'a211e950-0bd1-4580-bb78-efb534e649e8';

		const socket = io(SERVER_URL, {
			reconnection: true,
			reconnectionDelay: 500,
			transports: ['websocket'],
			query: {
				examId: '',
				definitionId,
				externalExamId,
			},
		});

		let messages = 0;

		socket.on('examCreated', ({ data }) => {
			examId = data.id;
			socket.emit('streamStarted', { examId });
			console.log(`${examId} | User ${i} received exam ID ${examId}`);
		});

		socket.on('webcamAnalysisResult', ({ objects }) => {
			console.log(
				`${examId} | User ${i} received objects: ${
					objects[0]?.map((object) => object.type + ' (' + object.confidence_percentage + ')').join(', ') ?? ''
				}`
			);

			messages += 1;
		});

		socket.on('screenAnalysisResult', ({ objects }) => {
			console.log(
				`${examId} | User ${i} received screen results: ${
					objects[0]?.map((object) => object.type + ' (' + object.confidence_percentage + ')').join(', ') ?? ''
				}`
			);
		});

		const logTotalMessages = () =>
			console.log(`${examId} | User ${i} received ${messages} messages in ${DURATION / 1000} seconds.`);

		const interval = setInterval(() => {
			socket.emit('videoChunkCaptured', { examId, video: videoChunk, timestamp: Date.now() });
			socket.emit('screenChunkCaptured', { examId, video: screenChunk, timestamp: Date.now() });
		}, 2000);

		setTimeout(() => {
			clearInterval(interval);
			setTimeout(() => {
				logTotalMessages();
				socket.emit('examFinished', { examId });
				socket.disconnect();
				console.log(`${examId} | User ${i} disconnected.`);
			}, COOLDOWN_PERIOD);
		}, DURATION);
	}
};

simulateLoad();

const PORT = 3000;
app.listen(PORT, () => console.log(`Proctoring performance test server listening on port ${PORT}`));
