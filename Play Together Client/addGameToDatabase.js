const { cloneDeep } = require('lodash');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

Games.push(createGame(0, "Dart", 60000));
Games.push(createGame(1, "Bird", 60000));
Games.push(createGame(2, "Piano", 60000));
Games.push(createGame(3, "Ball", 60000));
Games.push(createGame(4, "Hole", 10000));

addGameToDatabase(5);

async function addGameToDatabase(newGamesLength) {
    const playersRef = await db.collection('Users').get();

    playersRef.forEach(doc => {
        console.log(doc.id, '=>', doc.data());
        let increasingGameAmount = newGamesLength - doc.data().playerScores.playerGamesNoScore.length;
        console.log("increasingGameAmount ", increasingGameAmount + "playerGamesNoScore.length " + doc.data().playerScores.playerGamesNoScore.length)
        if (increasingGameAmount > 0) {
            var i;
            var playerScores = cloneDeep(doc.data().playerScores);
            for (i = 0; i < increasingGameAmount; i++) {
                playerScores.playerGamesNoScore.push({
                    gameName: Games[playerScores.playerGamesNoScore.length + i],
                    gameNo: playerScores.playerGamesNoScore.length + i,
                    playedGamesNumber: 0,
                    avarageScore: 0,
                    highScore: 0
                })
                doc.ref.update({
                    playerScores: playerScores
                });
            }
        }
    });
}