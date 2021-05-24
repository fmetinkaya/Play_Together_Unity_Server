const admin = require('firebase-admin');
const { cloneDeep } = require('lodash');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

TournamentCreateDatabase(2)
//TournamentRemoveDatabase();

async function TournamentRemoveDatabase() {
    let TournamentsRef = db.collection('Tournaments')
    let batch = db.batch();
    batch.update(TournamentsRef.doc("isEnableChange"), { enable: false })


    let snapshot = await TournamentsRef.orderBy("tournamentDate", "asc").get();
    snapshot.forEach(doc => {
        if (doc.id != "isEnableChange") {
            if (getTimeDifferenceMillisecond(doc.data().tournamentDate.toDate()) < 0) {
                batch.delete(doc.ref);
            }
        }
    });
    batch.update(TournamentsRef.doc("isEnableChange"), { enable: true });
    await batch.commit();
}

function TournamentCreateDatabase(gameNumber) {
    let tournamentGames = new Array();

    tournamentGames.push(createTournamentGame(0, 30000));
    tournamentGames.push(createTournamentGame(1, 30000));
    tournamentGames.push(createTournamentGame(2, 30000));
    tournamentGames.push(createTournamentGame(3, 30000));
    tournamentGames.push(createTournamentGame(4, 30000));
    tournamentGames.push(createTournamentGame(0, 30000));
    tournamentGames.push(createTournamentGame(1, 30000));
    tournamentGames.push(createTournamentGame(2, 30000));
    tournamentGames.push(createTournamentGame(3, 30000));
    tournamentGames.push(createTournamentGame(4, 30000));

    /*
    let i;
    for (i = 0; i < gameNumber; i++) {
    }*/

    let date = new Date();
    //date.setSeconds(date.getSeconds() + 5);
    date.setMinutes(date.getMinutes() + 150); // minutes
    //date.setDate(date.getDate() + 7); //day
    let tournament = createTournament(tournamentGames, date);
    db.collection('Tournaments').add(tournament);
}

function createTournamentGame(gameNo, waitAtRoomScreen) {
    return { gameNo: gameNo, waitAtRoomScreen: waitAtRoomScreen };
}



function createTournament(tournamentGames, tournamentDate) {
    let nextGameDate = cloneDeep(tournamentDate);
    nextGameDate.setMilliseconds(nextGameDate.getMilliseconds() + tournamentGames[0].waitAtRoomScreen);

    return { tournamentGames: tournamentGames, tournamentDate: tournamentDate}//, nextGameDate: nextGameDate }
}

function getTimeDifferenceMillisecond(dateFuture) {
    let dateNow = new Date();
    console.log("dateFuture ", dateFuture.toString());
    console.log("dateNow ", dateNow.toString());

    let difference = dateFuture.getTime() - dateNow.getTime();
    console.log("difference ", difference);

    return difference;
}
