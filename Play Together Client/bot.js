const { cloneDeep } = require('lodash');

var db;

/*const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();*/

const PASSWORD_OF_BOT = "159753456";

const BOT_INTERVAL_TOLERANCE_TIME = 3000;

var BotScoreStaticArray = Array(); 

BotScoreStaticArray.push(createBotScoreStatic(50, 300, -10, 100));
BotScoreStaticArray.push(createBotScoreStatic(800, 1700, -10, 100));
BotScoreStaticArray.push(createBotScoreStatic(20800, 30300, -10, 100));
BotScoreStaticArray.push(createBotScoreStatic(1600, 2200, -10, 100));
BotScoreStaticArray.push(createBotScoreStatic(3000, 12000, -10, 100));

//botType = 1 tournament bot, botType = 2 match bot,    
///////////////////////////////////////////////////////////////////////

//StartBotSytem(db);

async function StartBotSytem(_db) {
    db = _db;
    await ClearBotAndPlayerState();

    BotSystem(120, 1); //TournamentBot;
    BotSystem(15, 2); //Match Bot;
}

function StartSocket(playerName, playerBotsDatabaseID, botRoomID, botFutureDate, botType) {
    const io = require("socket.io-client");
    const socket = io('https://metinsocket.herokuapp.com/');
    //const socket = io('http://localhost:3000');

    var isRoomOwner = false;
    var myRoom;
    var myPlayer;
    var match;
    var lookForMatchTimeout;
    var lookForMatchIntervalMillisecond = 30000;

    setTimeout(() => BotDisconnectSocket(socket, myRoom, botFutureDate, lookForMatchTimeout), getTimeDifferenceMillisecond(botFutureDate));

    socket.on('connect', async () => {
        console.log("connected");

        socket.emit('Login', playerName + "@gmail.com", PASSWORD_OF_BOT, botRoomID, (data) => {
            console.log("Login Emit was started result ", data);
            if (botType == 2 && isRoomOwner)
                socket.emit("LookForMatch", true);

        });

        socket.on('disconnect', () => {
            BotDisconnectDatabase(playerBotsDatabaseID);
        });

        socket.on('PlayerUpdate', (player) => {
            player = JSON.parse(player);
            myPlayer = player;
            console.log("PlayerUpdate Player Name ", myPlayer.playerName);
        });

        socket.on('updateRoom', (room) => {
            myRoom = JSON.parse(room);
            console.log("updateRoom Player Name ", myPlayer.playerName, " roomMatchID ", myRoom.roomMatchID);

            if (myRoom.players[0].playerGlobalID == myPlayer.playerGlobalID) {
                isRoomOwner = true;
            } else {
                isRoomOwner = false;
            }
            console.log("Room Owner Player Name ", myPlayer.playerName, " ", isRoomOwner);
        });

        socket.on('StartMatch', (_match) => {
            match = JSON.parse(_match);
            console.log(match, " ", match.matchID, " ", match.game.gameNo);
            socket.emit('SendScore', (JSON.stringify(createPlayerScore(match.matchID, match.game.gameNo, getBotScore(match.game.gameNo)))));
        });

        socket.on('ScoreResult', (scoreResult, matchID) => {
            console.log(matchID, " ", JSON.parse(scoreResult));
            if (match != null) {
                let isDisconnected = BotDisconnectSocket(socket, myRoom, botFutureDate, lookForMatchTimeout);
                if (isRoomOwner && !isDisconnected) {
                    if (match.matchType == 3) {
                        socket.emit('LeaveTournamentRoom');
                    }
                    if (match.matchType == 2) {
                        lookForMatchTimeout = setTimeout(function () { socket.emit("LookForMatch", true); }, lookForMatchIntervalMillisecond);
                    }
                }
            }
        });
    });
}

async function StartBotsFromRoomGroupNo(roomGroupNo, botRoomID, botFutureDate, botType) {
    const bots = db.collection('Bots');
    const snapshot = await bots.where('roomGroupNo', '==', roomGroupNo).get();
    if (snapshot.empty) {
        console.log('No matching documents.');
        return;
    }
    for (const doc of snapshot.docs) {
        console.log(doc.id, '=>', doc.data());
        StartSocket(doc.data().playerName, doc.id, botRoomID, botFutureDate, botType);
    }
}

async function SelectRandomBot(botRoomID, botFutureDate, botType) {
    console.log('SelectRandomBot was started');
    const botsRef = db.collection('Bots').where('isOnline', '==', false);

    var selectedBotGroupNo;
    try {

        await db.runTransaction(async (t) => {
            var roomGroupNoArray = new Set();
            const botDocs = await t.get(botsRef);

            if (botDocs.empty) {
                console.log('No matching documents.');
                return;
            }
            for (const doc of botDocs.docs) {
                roomGroupNoArray.add(doc.data().roomGroupNo)
            }

            selectedBotGroupNo = getRandomItemFromSets(roomGroupNoArray);

            console.log('selectedBotGroupNo ', selectedBotGroupNo);

            let selectedBotDocs = await db.collection('Bots').where('roomGroupNo', '==', selectedBotGroupNo).get();
            for (const doc of selectedBotDocs.docs) {
                t.update(doc.ref, { isOnline: true });
            }

        });
        StartBotsFromRoomGroupNo(selectedBotGroupNo, botRoomID, botFutureDate, botType)
        console.log('Transaction success!');
    } catch (e) {
        console.log('Transaction failure:', e);
    }
}

function BotSystem(botIntervalMinute, botType) {
    console.log('StartBotSystem was started');

    let botRoomID;

    let botFutureDate = new Date();
    botFutureDate.setMinutes(botFutureDate.getMinutes() + botIntervalMinute);

    let botFutureDatePlusToleranceTime = cloneDeep(botFutureDate);
    if (botType == 1) {
        botRoomID = "1";
        botFutureDatePlusToleranceTime.setMilliseconds(botFutureDate.getMilliseconds() - BOT_INTERVAL_TOLERANCE_TIME);
    } else {
        botRoomID = Date.now().toString();
        botFutureDatePlusToleranceTime.setMilliseconds(botFutureDate.getMilliseconds() + BOT_INTERVAL_TOLERANCE_TIME);
    }

    SelectRandomBot(botRoomID, botFutureDate, botType);
    setTimeout(() => BotSystem(botIntervalMinute, botType), getTimeDifferenceMillisecond(botFutureDatePlusToleranceTime));
}

function BotDisconnectSocket(socket, myRoom, botFutureDate, lookForMatchTimeout) {
    console.log('BotDisconnectSocket was started');

    if (myRoom.roomMatchID == "" && getTimeDifferenceMillisecond(botFutureDate) <= 0) {
        if (lookForMatchTimeout != null) {
            clearTimeout(lookForMatchTimeout);
        }
        socket.disconnect();
        return true;
    }
    return false;
}

async function BotDisconnectDatabase(playerBotsDatabaseID) {
    console.log('BotDisconnectDatabase was started');
    let disconnectedBotRef = db.collection('Bots').doc(playerBotsDatabaseID);
    await disconnectedBotRef.update({ isOnline: false });
}

async function ClearBotAndPlayerState() {
    const batch = db.batch();

    const onlineBotsDocs = await db.collection('Bots').where('isOnline', '==', true).get();

    for (const doc of onlineBotsDocs.docs) {
        batch.update(doc.ref, { isOnline: false });
    }

    const onlinePlayerDocs = await db.collection('Users').where('playerSocketID', '!=', "").get();

    for (const doc of onlinePlayerDocs.docs) {
        batch.update(doc.ref, { playerSocketID: "" });
    }

    await batch.commit();
}

function getTimeDifferenceMillisecond(dateFuture) {
    let dateNow = new Date();

    let difference = dateFuture.getTime() - dateNow.getTime();
    console.log("difference ", difference);

    return difference;
}

function getRandomItemFromSets(set) {
    let items = Array.from(set);
    return items[Math.floor(Math.random() * items.length)];
}

function createPlayerScore(matchID, gameNo, score, player) {
    return { matchID: matchID, player: player, gameNo: gameNo, score: score }
}

function createBotScoreStatic(avarageScore, highestScore, randomPercentMin, randomPercentMax) {
    return { avarageScore: avarageScore, highestScore: highestScore, randomPercentMin: randomPercentMin, randomPercentMax: randomPercentMax }
}

function getBotScore(gameNo) {
    let BotScoreStatic = BotScoreStaticArray[gameNo];
    let score = BotScoreStatic.avarageScore
        + Math.round(((BotScoreStatic.highestScore - BotScoreStatic.avarageScore) * (getRndInteger(BotScoreStatic.randomPercentMin, BotScoreStatic.randomPercentMax) / 100)));
    if (score < 0)
        return 0;
    return score;
}

function getRndInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = {
    StartBotSytem
};






