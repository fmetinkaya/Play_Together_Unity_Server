/*const { cloneDeep } = require('lodash');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
var TournamentChampions = new Map();

TournamentChampionSendToDatabase("asdsadasdasasd");
function TournamentChampionAddRoom(roomID) {
    let tournament = Rooms.get(roomID).tournamentRoom.tournament;

    if (!TournamentChampions.has(tournament.tournamentID)) {
        TournamentChampions.set(tournament.tournamentID, CreateTournamentChampion([], tournament.tournamentGames.length, tournament.tournamentDate))
    }
    let TCRoom = CreateTCRoom([], Rooms.get(roomID).roomName, Rooms.get(roomID).tournamentRoom.wonGames)
    Rooms.get(roomID).players.forEach((values) => {
        TCRoom.TCPlayers.push(CreateTCPlayer(values.playerGlobalID, values.playerAvatar, values.playerName));
    })
    TournamentChampions.get(tournament.tournamentID).TCRooms.push(TCRoom);
}

async function TournamentChampionSendToDatabase(roomID) {
    //let tournament = Rooms.get(roomID).tournamentRoom.tournament;

    await db.collection('TournamentChampions').doc(new Date()).set({ roomID: roomID });

    //TournamentChampions.delete(tournament.tournamentID)

}

function CreateTournamentChampion(TCRooms, playedGames, tournamentDate) {

    return { TCRooms: TCRooms, playedGames: playedGames, tournamentDate: tournamentDate };
}

function CreateTCPlayer(playerGlobalID, playerAvatar, playerName) {
    return { playerGlobalID: playerGlobalID, playerAvatar: playerAvatar, playerName: playerName };
}

function CreateTCRoom(TCPlayers, roomName, wonGames) {
    return { TCPlayers: TCPlayers, roomName: roomName, wonGames: wonGames };
}*/



