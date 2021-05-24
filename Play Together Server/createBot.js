const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const io = require("socket.io-client");
const socket = io('https://metinsocket.herokuapp.com/');

const PASSWORD_OF_BOT = "159753456";

socket.on('connect', async () => {
    console.log("connected");

    await SignUpFromRoom(0);

});

async function SignUpFromRoom(roomGroupNo) {
    const citiesRef = db.collection('Bots');
    const snapshot = await citiesRef/*.where('roomGroupNo', '==', roomGroupNo)*/.get();
    if (snapshot.empty) {
        console.log('No matching documents.');
        return;
    }

    snapshot.forEach(doc => {
        console.log(doc.id, '=>', doc.data());
        socket.emit('Sign Up', doc.data().playerName, doc.data().playerName + "@gmail.com", 5549997248, PASSWORD_OF_BOT, true, (data) => {
            console.log(data);
        });
    });

}

/*var playerNames = ["cafer","samet"];
createBotForDatabase(playerNames, 0, "caferRoom")
async function createBotForDatabase(playerNames, roomGroupNo, roomName) {
    playerNames.forEach(async (playerName) => {
        console.log(playerName)
        let bot = { playerName: playerName, roomGroupNo: roomGroupNo, roomName: roomName }
        await db.collection('Bots').doc().set(bot);
    });
}*/
