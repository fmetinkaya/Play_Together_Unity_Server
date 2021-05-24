"use strict";

const { cloneDeep } = require('lodash');
const PORT = process.env.PORT || 3000;
const io = require('socket.io')(PORT, {

});

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
const fieldValue = admin.firestore.FieldValue;
var Players = new Map();
var Rooms = new Map();
var Matchs = new Map();
var LookForMatchRoom = "";
console.log('Listen Port' + PORT);

var Games = new Array();
Games.push(createGame(0, "Dart", 60000));
Games.push(createGame(1, "Bird", 60000));
Games.push(createGame(2, "Piano", 60000));
Games.push(createGame(3, "Ball", 60000));
Games.push(createGame(4, "Hole", 120000));


///////////////////////STATİCS////////////////////////////
const SCORE_INCREASE_AMOUNT = 2;
const SCORE_DECREASE_AMOUNT = 1;
const GAME_SCREEN_WAIT_TIME = 5000;
const GAME_SCREEN_WAİT_FOR_SCORE_TOLERANCE_TIME = 5000;
const BOT_ROOM_ID = "1";
//////////////////////////////////////////////////////////
//Matchtype == 1 (together), Matchtype == 2 (opponentRoom), Matchtype == 3 (tournament)

/////////////////////////////////////
var tournamentsTask;
var NextTournament = null;
ListenTournamentsDatabase();
var TournamentRooms = new Map();
////////////////////////////////////////

////////////////////////////////////////////
var botScript = require("./bot.js");
botScript.StartBotSytem(db);
///////////////////////////////////////////

//////////////////////////////////////////
var TournamentChampions = new Map();
//////////////////////////////////////////

//////////////////////////////////////////debug mode
console.log = function() {};
//////////////////////////////////////////debug mode

io.on('connection', (socket) => {
  connect();

  socket.on('disconnect', () => {
    disconnect(socket);
  });

  socket.on('Login', async (playerName, password, botRoomID, loginCallBack) => {
    let loginValue = await login(playerName, password, socket, botRoomID);
    loginCallBack(loginValue);
  });

  socket.on('Sign Up', async (playerName, userEmail, userPhone, password, isItBot, signUpCallBack) => {
    signUpCallBack(await signUp(playerName, userEmail, userPhone, password, isItBot));
  });

  socket.on('AddFriendRequest', async (requestOwnerGlobalID, requestedGlobalID, addFriendRequestCallBack) => {
    addFriendRequestCallBack(await addFriendRequest(Players.get(socket.id).playerName, requestOwnerGlobalID, requestedGlobalID));
  });

  socket.on('AcceptFriend', async (requestOwnerGlobalID, requestedGlobalID) => {
    await addFriendGlobalID(requestOwnerGlobalID, requestedGlobalID);
    FriendsUpdate(requestOwnerGlobalID);
    FriendsUpdate(requestedGlobalID);
  });

  socket.on('RemoveFriend', async (requestOwnerGlobalID, requestedGlobalID) => {
    await removeFriendGlobalID(requestOwnerGlobalID, requestedGlobalID);
    FriendsUpdate(requestOwnerGlobalID);
    FriendsUpdate(requestedGlobalID);
  });

  socket.on('GetFriends', async (playerGlobalID, getFriendsdRequestCallBack) => {
    getFriendsdRequestCallBack(await getFriendsArray(playerGlobalID));
  });

  socket.on('InviteRoomRequest', async (invitedPlayerSocketID, inviteRoomRequestCallBack) => {
    inviteRoomRequestCallBack(await InviteRoomRequest(socket, invitedPlayerSocketID));
  });

  socket.on('AcceptInviteRoomRequest', (roomID) => {
    acceptInviteRoom(socket, roomID);
  });

  socket.on('KickFromRoom', (kickedPlayerSocketID, kickedRoomID) => {
    KickFromRoom(kickedPlayerSocketID, kickedRoomID);
  });

  socket.on('LeaveFromRoom', () => {
    LeaveFromRoom(socket);
  });

  socket.on('LookForMatch', (isLookingForOppenent) => {
    lookForMatch(Players.get(socket.id).playerRoomID, isLookingForOppenent)
  });

  socket.on('SendScore', (playerScore) => {
    sendScore(playerScore, socket.id);
  });

  socket.on('PlayTogether', (gameNo) => {
    PlayTogether(Players.get(socket.id).playerRoomID, gameNo)
  });

  socket.on('SendSettings', (settings) => {
    SendSettings(socket, JSON.parse(settings))
  });

  socket.on('SendMessage', (chatMessage) => {
    SendMessage(JSON.parse(chatMessage))
  });

  socket.on('JoinTournamentRoom', () => {
    JoinTournamentRoom(Players.get(socket.id).playerRoomID, NextTournament)
  });

  socket.on('LeaveTournamentRoom', () => {
    LeaveTournamentRoom(Players.get(socket.id).playerRoomID)
  });
  socket.on('GetTournamentChampions', async (GetTournamentChampionsCallBack) => {
    GetTournamentChampionsCallBack(await GetTournamentChampions());
  });
});

async function GetTournamentChampions() {
  console.log("GetTournamentChampions ");

  let tournamentsChampionsObject = { tournamentChampions: [] };

  const TournamentChampionsRef = db.collection('TournamentChampions').orderBy("tournamentDate", "desc");
  const snapshot = await TournamentChampionsRef.get();
  snapshot.forEach(doc => {
    let tournamentChampion = doc.data();
    tournamentChampion.tournamentDate = doc.data().tournamentDate.toDate();
    tournamentsChampionsObject.tournamentChampions.push(tournamentChampion);
  });

  return JSON.stringify(tournamentsChampionsObject);
}

function LeaveAndRemoveTournamentRoom(roomID) {
  console.log("LeaveAndRemoveTournamentRoom ", roomID);

  let tournamentID = Rooms.get(roomID).tournamentRoom.tournament.tournamentID;
  TournamentChampionAddRoom(roomID);
  removeArrayItem(TournamentRooms.get(tournamentID), "roomID", roomID);
  Rooms.get(roomID).tournamentRoom = null;
  updateRoom(roomID);

  if (TournamentRooms.get(tournamentID).length == 0) {
    TournamentChampionSendToDatabase(tournamentID);
    removeTournamentRoom(tournamentID);
  }
  console.log("TournamentRooms Container " + mapToJson(TournamentRooms));
}

function TournamentChampionAddRoom(roomID) {
  console.log("TournamentChampionAddRoom " + roomID);

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

async function TournamentChampionSendToDatabase(tournamentID) {
  console.log("TournamentChampionSendToDatabase " + tournamentID);

  TournamentChampions.get(tournamentID).TCRooms.sort((a, b) => (a.wonGames < b.wonGames ? 1 : -1));

  await db.collection('TournamentChampions').doc(TournamentChampions.get(tournamentID).tournamentDate.toString()).set(TournamentChampions.get(tournamentID));

  TournamentChampions.delete(tournamentID);

}

function removeTournamentRoom(tournamentID) {
  console.log("removeTournament ", tournamentID);
  TournamentRooms.get(tournamentID).forEach(function (tournamentRoom) {
    Rooms.get(tournamentRoom.roomID).tournamentRoom = null;
    updateRoom(tournamentRoom.roomID);
  });
  TournamentRooms.delete(tournamentID);
  console.log("TournamentRooms Container " + mapToJson(TournamentRooms));
}

function removeArrayItem(array, key, value) {
  console.log("removeArrayItem key", key, " value ", value);
  const findIndex = array.findIndex(a => a[key] === value)

  findIndex !== -1 && array.splice(findIndex, 1)
}
function createTournamentRoom(roomID, wonGames, playedGames, tournament) {
  return { roomID: roomID, wonGames: wonGames, playedGames: playedGames, tournament: tournament }
}
function JoinTournamentRoom(roomID, tournament) {
  console.log("JoinTournamentRoom ", roomID);
  if (tournament) {
    let tournamentRoom = createTournamentRoom(roomID, 0, 0, tournament);
    TournamentRooms.get(tournament.tournamentID).push(tournamentRoom);
    Rooms.get(roomID).tournamentRoom = tournamentRoom;
    roomStateUpdate(roomID, false, null);
  } else {
    updateRoom(roomID);
  }
  console.log("TournamentRooms Container " + mapToJson(TournamentRooms));
}

function LeaveTournamentRoom(roomID) {
  console.log("LeaveTournamentRoom ", roomID);
  if (Rooms.get(roomID).tournamentRoom != null) {
    let tournamentID = Rooms.get(roomID).tournamentRoom.tournament.tournamentID;
    removeArrayItem(TournamentRooms.get(tournamentID), "roomID", roomID);
    Rooms.get(roomID).tournamentRoom = null;
    updateRoom(roomID);
  }
  console.log("TournamentRooms Container " + mapToJson(TournamentRooms));
}

function startGame(tournamentGameNumber, tournamentID, gameNo, tournamentNumber, isLastGame) {
  console.log(" tournament No ", tournamentNumber, " startGame was started no", tournamentGameNumber, " TournamentID ", tournamentID, " Game No " + gameNo);

  TournamentOrdeyByWonGames(tournamentID);
  MatchTournamentPlayers(tournamentID, gameNo, isLastGame);
}
function TournamentOrdeyByWonGames(tournamentID) {
  console.log("TournamentOrdeyByWonGames ", tournamentID);

  TournamentRooms.get(tournamentID).sort((a, b) => (a.wonGames < b.wonGames ? 1 : -1))
}

function MatchTournamentPlayers(tournamentID, gameNo, isLastGame) {
  console.log("MatchTournamentPlayers ", tournamentID);
  var i;
  for (i = 0; i < (TournamentRooms.get(tournamentID).length + (TournamentRooms.get(tournamentID).length % 2)); i = i + 2) {
    let matchingRoomsID = [];
    matchingRoomsID.push(TournamentRooms.get(tournamentID)[i].roomID);

    if (i + 1 == TournamentRooms.get(tournamentID).length) {
      JoinTournamentRoom(BOT_ROOM_ID, TournamentRooms.get(tournamentID)[i].tournament)
      matchingRoomsID.push(BOT_ROOM_ID);
    } else {
      matchingRoomsID.push(TournamentRooms.get(tournamentID)[i + 1].roomID);
    }

    addMatch(matchingRoomsID, gameNo, 3, isLastGame);
  }
}

function AddWonGamesAndPlayedGames(roomID, addWonGames, addPlayedGames) {
  console.log("AddWonGamesAndPlayedGames ", roomID);
  let tournamentID = Rooms.get(roomID).tournamentRoom.tournament.tournamentID
  console.log("AddWonGamesAndPlayedGames +TournamentRooms", TournamentRooms);
  let tournamentRoom = TournamentRooms.get(tournamentID).filter(function (data) { return data.roomID == roomID })[0];
  console.log("AddWonGamesAndPlayedGames +tournamentRoom", tournamentRoom);

  tournamentRoom.wonGames += addWonGames;
  tournamentRoom.playedGames += addPlayedGames;
}

async function startTournaments(tournaments, i) {
  console.log("startTournamentssssssss was started");
  if (tournaments.length > i) {

    if (getTimeDifferenceMillisecond(tournaments[i].tournamentDate) > 0) {

      let tournamentID = Date.now().toString(); //unique match id

      tournaments[i].tournamentID = tournamentID;

      TournamentRooms.set(tournamentID, new Array());

      NextTournamentUpdate(tournaments[i]);

      tournamentsTask = await setTimeout(() => {
        startTournaments(tournaments, i + 1);
        startTournament(tournaments[i], 0, i);
      }, getTimeDifferenceMillisecond(tournaments[i].tournamentDate));
    } else {
      startTournaments(tournaments, i + 1);
    }

  } else {
    NextTournamentUpdate(null);
  }

}

async function startTournament(tournament, tournamentGameNumber, tournamentNumber) {
  console.log("startTournamenttttttttttttttt was started");

  let waitForGamePlayTime = tournament.tournamentGames[tournamentGameNumber].waitAtRoomScreen;
  if (tournamentGameNumber > 0) {
    waitForGamePlayTime += GAME_SCREEN_WAIT_TIME + GAME_SCREEN_WAİT_FOR_SCORE_TOLERANCE_TIME + Games[tournament.tournamentGames[tournamentGameNumber - 1].gameNo].gameScreenGameTime;
  }

  let currentDate = new Date();
  currentDate.setMilliseconds(currentDate.getMilliseconds() + waitForGamePlayTime);
  tournament.nextGameDate = currentDate;

  if (tournament.tournamentGames.length > tournamentGameNumber) {
    await setTimeout(() => {
      if (TournamentRooms.get(tournament.tournamentID).length != 0) {
        if (tournament.tournamentGames.length == tournamentGameNumber + 1) {
          startGame(tournamentGameNumber, tournament.tournamentID, tournament.tournamentGames[tournamentGameNumber].gameNo, tournamentNumber, true);
        } else {
          startGame(tournamentGameNumber, tournament.tournamentID, tournament.tournamentGames[tournamentGameNumber].gameNo, tournamentNumber, false);
        }

        startTournament(tournament, tournamentGameNumber + 1, tournamentNumber);
      } else {
        removeTournamentRoom(tournament.tournamentID);
      }
    }, waitForGamePlayTime);
  }

}

function ListenTournamentsDatabase() {
  db.collection("Tournaments").orderBy("tournamentDate", "asc").onSnapshot(function (querySnapshot) {
    var Tournaments = new Array();
    var isEnableChange = false;

    querySnapshot.forEach(function (doc) {
      //console.log("nextGameDate ", doc.data().nextGameDate);
      if (doc.id != "isEnableChange") {
        let tournament = doc.data();
        tournament.tournamentDate = doc.data().tournamentDate.toDate();

        let nextGameDate = doc.data().tournamentDate.toDate();
        nextGameDate.setMilliseconds(nextGameDate.getMilliseconds() + doc.data().tournamentGames[0].waitAtRoomScreen);
        tournament.nextGameDate = nextGameDate;

        if (getTimeDifferenceMillisecond(tournament.tournamentDate) > 0)
          Tournaments.push(tournament);
      } else {
        isEnableChange = doc.data().enable;
      }
    });
    console.log("Tournaments container ", Tournaments);
    if (isEnableChange) {

      clearTournaments();

      startTournaments(Tournaments, 0);
    }
  });
}

function clearTournaments() {
  console.log("clearTournaments ",);
  if (NextTournament != null) {
    removeTournamentRoom(NextTournament.tournamentID);
  }
  clearTimeout(tournamentsTask);
}

function getTimeDifferenceMillisecond(dateFuture) {
  let dateNow = new Date();
  console.log("dateFuture ", dateFuture.toString());
  console.log("dateNow ", dateNow.toString());

  let difference = dateFuture.getTime() - dateNow.getTime();
  console.log("difference ", difference);

  return difference;
}

function NextTournamentUpdate(nextTournament, playerSocketID) {
  console.log("NextTournamentUpdate ", nextTournament)
  NextTournament = nextTournament;
  if (playerSocketID != null) {
    io.to(playerSocketID).emit("NextTournamentUpdate", JSON.stringify(nextTournament))
  } else {
    io.emit("NextTournamentUpdate", JSON.stringify(nextTournament));
  }
}

function SendMessage(chatMessage) {
  console.log("SendMessage was started", chatMessage);
  console.log("ReceiveMessage was sent", chatMessage);
  chatMessage.date = new Date().toUTCString();
  io.to(chatMessage.playerRoomID).emit("ReceiveMessage", JSON.stringify(chatMessage));
}
function SendSettings(socket, settings) {
  console.log("SendSettings was started", settings);

  UpdateDatabaseUserFromSettings(settings);

  UpdatePlayerFromSettings(socket.id, settings);

  UpdateRoomName(socket.id);

  updateRoom(Players.get(socket.id).playerRoomID);

  PlayerUpdate(socket.id);
}

function UpdatePlayerFromSettings(playerSocketID, settings) {
  console.log("UpdatePlayerFromSettings ", settings);
  Players.get(playerSocketID).playerAvatar = settings.playerAvatar;
  Players.get(playerSocketID).playerName = settings.playerName;
  Players.get(playerSocketID).personalRoomName = settings.personalRoomName;
}

function UpdateRoomName(playerSocketID) {
  console.log("UpdateRoomName ", playerSocketID);

  let roomID = Players.get(playerSocketID).playerRoomID;
  console.log("UpdateRoomName RoomId", roomID);

  let roomOwnerPlayerGlobalID = Rooms.get(roomID).players.values().next().value.playerGlobalID;
  let playerGlobalID = Players.get(playerSocketID).playerGlobalID;

  if (roomOwnerPlayerGlobalID == playerGlobalID) {
    Rooms.get(roomID).roomName = Players.get(playerSocketID).personalRoomName;
  }
}
function UpdateDatabaseUserFromSettings(settings) {
  console.log("UpdateDatabaseUserFromSettings ", settings);
  db.collection('Users').doc(settings.playerGlobalID).update({
    playerAvatar: settings.playerAvatar,
    playerName: settings.playerName,
    personalRoomName: settings.personalRoomName,
  });
}
function GlobalIDToSocketID(playerGlobalID) {
  console.log("GlobalIDToSocketID was started");
  for (let [socketID, player] of Players.entries()) {
    if (player.playerGlobalID === playerGlobalID)
      return socketID;
  }
  return null;
}
function FriendsUpdate(playerGlobalID) {
  console.log("FriendsUpdate was started");
  let playerSocketID = GlobalIDToSocketID(playerGlobalID);
  if (playerSocketID) {
    io.to(playerSocketID).emit('FriendUpdated');
  }
}
function PlayerUpdate(playerSocketID) {
  console.log("PlayerUpdate was started");
  io.to(playerSocketID).emit('PlayerUpdate', JSON.stringify(Players.get(playerSocketID)));
}
function removeScoreMainWeekly(matchType, matchRooms) {
  console.log("removeScoreMainWeekly was started");
  var i;
  for (i = 0; i < matchRooms.length && Rooms.has(matchRooms[i]); i++) {
    Rooms.get(matchRooms[i]).players.forEach(function (player) {
      console.log("removeScoreMainWeekly ", player.playerName);
      player.playerScores.playerMainScore = player.playerScores.playerMainScore - SCORE_DECREASE_AMOUNT
      player.playerScores.playerWeeklyScore = player.playerScores.playerWeeklyScore - SCORE_DECREASE_AMOUNT
      if (player.playerScores.playerMainScore < 0) {
        player.playerScores.playerMainScore = 0;
      }
      if (player.playerScores.playerWeeklyScore < 0) {
        player.playerScores.playerWeeklyScore = 0;
      }

      AddOrRemoveWinningNumbers(player.playerSocketID, matchType, 0, 1);
    });

    if (matchType == 3) {
      AddWonGamesAndPlayedGames(matchRooms[i], 0, 1);
    }
  }
  console.log("Room Score ", mapToJson(Rooms))
  console.log("Players Score " + mapToJson(Players));
}

function addScoreMainWeekly(matchType, matchRooms, scoreResultArray) {
  console.log("addScoreMainWeekly was started");

  let winningRoomID = scoreResultArray[0].player.playerRoomID;
  let winningPlayerSocketID = scoreResultArray[0].player.playerSocketID;

  if ((matchType == 2 || matchType == 3) && Rooms.has(winningRoomID)) {
    let losingRoomRoomID = matchRooms.filter(function (data) { return data != winningRoomID })[0];
    let losingRoomPlayerSize = 1;
    if (Rooms.has(losingRoomRoomID)) {
      losingRoomPlayerSize = Rooms.get(losingRoomRoomID)["players"].size;
    }

    Rooms.get(winningRoomID).players.forEach(function (player) {
      console.log("addScoreMainWeekly Multi Room", player.playerName);
      player.playerScores.playerMainScore = player.playerScores.playerMainScore + (SCORE_INCREASE_AMOUNT * losingRoomPlayerSize);
      player.playerScores.playerWeeklyScore = player.playerScores.playerWeeklyScore + (SCORE_INCREASE_AMOUNT * losingRoomPlayerSize);

      AddOrRemoveWinningNumbers(player.playerSocketID, matchType, 1, 0);
    });

    if (matchType == 3) {
      AddWonGamesAndPlayedGames(winningRoomID, 1, 0);
    }

  }
  if (matchType == 1 && Players.has(winningPlayerSocketID)) {
    console.log("addScoreMainWeekly Single Room");
    let losingPlayerSize = Rooms.get(matchRooms[0])["players"].size;
    console.log("losingPlayerSize ", Rooms.get(matchRooms[0])["players"].size);
    Players.get(winningPlayerSocketID).playerScores.playerMainScore = Players.get(winningPlayerSocketID).playerScores.playerMainScore + (SCORE_INCREASE_AMOUNT * losingPlayerSize);
    Players.get(winningPlayerSocketID).playerScores.playerWeeklyScore = Players.get(winningPlayerSocketID).playerScores.playerWeeklyScore + (SCORE_INCREASE_AMOUNT * losingPlayerSize);

    AddOrRemoveWinningNumbers(winningPlayerSocketID, matchType, 1, 0);
  }

  console.log("Room Score ", mapToJson(Rooms));
  console.log("Players Score " + mapToJson(Players));

}

function addGameGamesNoScore(playerSocketID, gameNo, score) {
  console.log("addGameGamesNoScore was started");
  let playerGameNoScore = Players.get(playerSocketID).playerScores.playerGamesNoScore[gameNo];
  if (playerGameNoScore.highScore < score) {
    playerGameNoScore.highScore = score;
  }
  playerGameNoScore.avarageScore = ((playerGameNoScore.avarageScore * playerGameNoScore.playedGamesNumber) + score) / (playerGameNoScore.playedGamesNumber + 1);
  playerGameNoScore.playedGamesNumber = playerGameNoScore.playedGamesNumber + 1;
  console.log("addGameGamesNoScore was finished ", JSON.stringify(Players.get(playerSocketID)));
}

function PlayTogether(playerRoomID, gameNo) {
  console.log("PlayTogether ", playerRoomID);
  let matchingRoomsID = [];
  matchingRoomsID.push(playerRoomID);
  addMatch(matchingRoomsID, gameNo, 1, false);
}
function lookForMatch(playerRoomID, isLookingForOppenent) {
  console.log("LookForMatch ", playerRoomID);
  if (isLookingForOppenent) {
    if (LookForMatchRoom == "") {
      LookForMatchRoom = playerRoomID;
      roomStateUpdate(playerRoomID, true, null);
    } else {
      if (LookForMatchRoom != playerRoomID) {
        let peerRoomID = LookForMatchRoom;
        LookForMatchRoom = "";
        let matchingRoomsID = [];
        matchingRoomsID.push(playerRoomID);
        matchingRoomsID.push(peerRoomID);
        addMatch(matchingRoomsID, Math.floor(Math.random() * Games.length), 2, false);
      }
    }
  } else {
    roomStateUpdate(playerRoomID, false, null);
  }
}

function sendScore(playerScore, playerSocketID) {
  console.log("sendScore ", JSON.parse(playerScore));
  let playerScoreObject = JSON.parse(playerScore);

  if (Matchs.has(playerScoreObject.matchID)) {
    playerScoreObject.player = Players.get(playerSocketID);
    Matchs.get(playerScoreObject.matchID)["playersScore"].push(playerScoreObject);
    addGameGamesNoScore(playerSocketID, playerScoreObject.gameNo, playerScoreObject.score);
  }
  console.log("Matchs Container " + JSON.stringify(Matchs.get(playerScoreObject.matchID)));
}

function addMatch(matchingRoomsID, gameNo, matchType, isLastGame) {
  console.log("addMatch ", JSON.stringify(matchingRoomsID));

  let matchID = Date.now().toString(); //unique match id

  var match = createMatch(gameNo, matchID, matchType, GAME_SCREEN_WAIT_TIME);
  Matchs.set(matchID, match);

  sendStartMatch(match, matchingRoomsID);

  setTimeout(function () {
    sendScoreResult(matchID, matchingRoomsID, matchType, isLastGame)
  }, match.gameScreenWaitTime + Games[gameNo].gameScreenGameTime + GAME_SCREEN_WAİT_FOR_SCORE_TOLERANCE_TIME);
}
function sendStartMatch(match, matchingRoomsID) {
  console.log("sendStartMatch ", match);
  matchingRoomsID.forEach(function (roomID) {
    if (match.matchType == 1) {
      roomStateUpdate(roomID, null, match["matchID"]);
    }
    if (match.matchType == 2) {
      roomStateUpdate(roomID, false, match["matchID"]);
    }
    if (match.matchType == 3) {
      roomStateUpdate(roomID, false, match["matchID"]);
    }
    io.to(roomID).emit("StartMatch", JSON.stringify(match));
  });
}
function sendScoreResult(matchID, matchingRoomsID, matchType, isLastGame) {
  console.log("SendScoreResult matchId ", matchID);
  let scoreResultArray = Matchs.get(matchID)["playersScore"];

  scoreResultArray.sort((a, b) => (a.score < b.score ? 1 : -1))

  if (scoreResultArray.length > 0) {
    AddOrRemoveScore(Matchs.get(matchID).matchType, matchingRoomsID, scoreResultArray)
  }

  let scoreResult = new Object();
  scoreResult["playersScore"] = scoreResultArray;

  matchingRoomsID.forEach(function (roomID) {
    if (Rooms.has(roomID)) {
      io.to(roomID).emit("ScoreResult", JSON.stringify(scoreResult), matchID);

      if (matchType == 3 && isLastGame) {
        LeaveAndRemoveTournamentRoom(roomID);
      }

      if (Rooms.get(roomID)["roomMatchID"] == matchID) {
        roomStateUpdate(roomID, null, "");
      }
    }
  });
  console.log("sendScoreResult ", JSON.stringify(scoreResult));
  Matchs.delete(matchID);
  console.log("matchID Deleted ", matchID);

}

function AddOrRemoveWinningNumbers(playerSocketID, matchType, isWonInteger, isPlayedInteger) {
  console.log("AddOrRemoveWinningNumbers ", playerSocketID);
  if (matchType == 1) {
    Players.get(playerSocketID).playerScores.playerTotalSoloGames += isPlayedInteger;
    Players.get(playerSocketID).playerScores.playerSoloWins += isWonInteger;
  }
  if (matchType == 2) {
    Players.get(playerSocketID).playerScores.playerTotalMatchGames += isPlayedInteger;
    Players.get(playerSocketID).playerScores.playerMatchWins += isWonInteger;
  }
  if (matchType == 3) {
    Players.get(playerSocketID).playerScores.playerTotalTournamentGames += isPlayedInteger;
    Players.get(playerSocketID).playerScores.playerTournamentWins += isWonInteger;
  }
}

function AddOrRemoveScore(matchType, matchingRoomsID, scoreResultArray) {
  removeScoreMainWeekly(matchType, matchingRoomsID);
  addScoreMainWeekly(matchType, matchingRoomsID, scoreResultArray);
  PlayersUpdateFromRoom(matchingRoomsID);
}
function PlayersUpdateFromRoom(matchingRoomsID) {
  console.log("PlayersUpdateFromRoom was started");
  matchingRoomsID.forEach(function (roomID) {
    if (Rooms.has(roomID)) {
      Rooms.get(roomID).players.forEach(function (player) {
        PlayerUpdate(player.playerSocketID);
      });
    }
  });
}

function roomStateUpdate(roomID, isLookingForOppenent, roomMatchID,) {
  console.log("roomStateUpdated ", roomMatchID);

  if (isLookingForOppenent != null) {
    if (LookForMatchRoom == roomID && !isLookingForOppenent)
      LookForMatchRoom = "";
    Rooms.get(roomID)["roomIsLookingForOppenent"] = isLookingForOppenent;
  }
  if (roomMatchID != null)
    Rooms.get(roomID)["roomMatchID"] = roomMatchID;
  updateRoom(roomID);
}
function createMatch(gameNo, matchID, matchType, gameScreenWaitTime) {
  return { matchID: matchID, game: cloneDeep(Games[gameNo]), matchType: matchType, gameScreenWaitTime: gameScreenWaitTime, playersScore: [] };
}

function createGame(gameNo, gameName, gameScreenGameTime) {
  return { gameNo: gameNo, gameName: gameName, gameScreenGameTime: gameScreenGameTime }
}

async function InviteRoomRequest(socket, invitedPlayerGlobalID) {
  console.log("InviteRoomRequest ", invitedPlayerGlobalID);
  let invitedPlayerSocketID = await GlobalIDToSocketID(invitedPlayerGlobalID);

  if (invitedPlayerSocketID == null) {
    console.log("Your friend is not online.");
    return 1;
  }
  if (Players.get(invitedPlayerSocketID).playerRoomID == Rooms.get(Players.get(socket.id).playerRoomID)) {
    console.log("Your friend is already in this room.");
    return 2;
  }
  if (Rooms.get(Players.get(invitedPlayerSocketID).playerRoomID).roomMatchID != "") {
    console.log("Your friend is playing another game, try again when the game is over");
    return 3;
  }
  let _player = Players.get(socket.id);
  let _room = Rooms.get(_player.playerRoomID);
  console.log("InviteRoomRequested Sent", _player.playerName, _room.roomName, _player.playerRoomID);
  io.to(invitedPlayerSocketID).emit('InviteRoomRequested', _player.playerName, _room.roomName, _player.playerRoomID);
  console.log("Your friend has been successfully invited");
  return 0;

}
function acceptInviteRoom(playerSocket, roomID) {
  console.log("acceptInviteRoom ", Rooms.has(roomID));
  console.log("acceptInviteRoom ", mapToJson(getRoom(roomID)));

  if (Rooms.has(roomID) && Rooms.get(roomID).roomMatchID == "") {
    PlayerIsChangingRoom(playerSocket, roomID);
  }
}
function KickFromRoom(kickedPlayerSocketID, kickedRoomID) {
  console.log("KickFromRoom ", kickedPlayerSocketID);

  if (Players.get(kickedPlayerSocketID).playerRoomID == kickedRoomID) {
    let roomID = Date.now().toString(); //unique room id

    let kickedPlayerSocket = io.of("/").sockets.get(kickedPlayerSocketID);

    PlayerIsChangingRoom(kickedPlayerSocket, roomID);
  }
}

function LeaveFromRoom(playerSocket) {
  console.log("LeaveFromRoom ", playerSocket.id);

  let roomID = Date.now().toString(); //unique room id

  PlayerIsChangingRoom(playerSocket, roomID);
}

function PlayerIsChangingRoom(playerSocket, roomID) {
  console.log("PlayerIsChangingRoom ", roomID);

  removePlayerFromRoom(playerSocket);

  addPlayerToRoom(roomID, playerSocket);
}

async function getFriendsArray(playerGlobalID) {
  console.log("GetFriends Request ", playerGlobalID);
  let friendsGlobalIDs = [];
  friendsGlobalIDs = await getFriendslobalIDArray(playerGlobalID);
  let friendsArrayOnline = [];
  let friendsArrayOffline = [];
  await Promise.all(friendsGlobalIDs.map(async function (friendsGlobalID) {
    let _player = await databaseGetPlayer(friendsGlobalID);
    if (_player.playerSocketID != "") {
      friendsArrayOnline.push(_player);
    } else {
      friendsArrayOffline.push(_player);
    }
  }));
  let friendsArray = new Object();
  friendsArray["players"] = friendsArrayOnline.concat(friendsArrayOffline);
  return JSON.stringify(friendsArray);
}
async function getFriendslobalIDArray(playerGlobalID) {
  let friendsGlobalID = [];
  let doc = await db.collection('Users').doc(playerGlobalID).get();
  friendsGlobalID = doc.data().userFriends;
  return friendsGlobalID;
}

async function databasePlayerConnect(playerGlobalID, playerSocketID) {
  console.log("databasePlayerConnect ", playerGlobalID, " ", playerSocketID);
  await db.collection('Users').doc(playerGlobalID).update({ playerSocketID: playerSocketID });
}
async function databasePlayerDisconnect(player) {
  console.log("databasePlayerDisconnect ", player);
  await db.collection('Users').doc(player.playerGlobalID).update({
    playerSocketID: "",
    playerScores: player.playerScores,
  });
}
async function addFriendGlobalID(globalID1, globalID2) {
  console.log("addFriendGlobalID ", globalID1, globalID2);

  let globalID1Ref = db.collection('Users').doc(globalID1);
  let globalID2Ref = db.collection('Users').doc(globalID2);

  await db.runTransaction(async (t) => {
    t.update(globalID1Ref, { userFriends: fieldValue.arrayUnion(globalID2) });
    t.update(globalID2Ref, { userFriends: fieldValue.arrayUnion(globalID1) });
  });
}
async function removeFriendGlobalID(globalID1, globalID2) {
  console.log("addFriendGlobalID ", globalID1, globalID2);

  let globalID1Ref = db.collection('Users').doc(globalID1);
  let globalID2Ref = db.collection('Users').doc(globalID2);

  await db.runTransaction(async (t) => {
    t.update(globalID1Ref, { userFriends: fieldValue.arrayRemove(globalID2) });
    t.update(globalID2Ref, { userFriends: fieldValue.arrayRemove(globalID1) });
  });
}
async function addFriendRequest(requestOwnerName, requestOwnerGlobalID, requestedGlobalID) {

  console.log("AddFriend Request ", requestOwnerName, requestOwnerGlobalID, requestedGlobalID);
  let addFriendRequestCallBackValue = { requestedFriendSocketID: "", value: 0, requestedGlobalID: requestedGlobalID };
  await friendRequestHasProblem(requestOwnerGlobalID, requestedGlobalID, addFriendRequestCallBackValue)
  console.log("addFriendRequestCallBackValue ", addFriendRequestCallBackValue);
  if (addFriendRequestCallBackValue.value == 0) {
    console.log("FriendshipRequest Sent ", requestOwnerName, requestOwnerGlobalID, addFriendRequestCallBackValue.requestedGlobalID);
    await io.to(addFriendRequestCallBackValue.requestedFriendSocketID).emit('FriendshipRequest', requestOwnerName, requestOwnerGlobalID, addFriendRequestCallBackValue.requestedGlobalID);
  }
  return addFriendRequestCallBackValue.value;
}
async function friendRequestHasProblem(requestOwnerGlobalID, requestedGlobalID, addFriendRequestCallBackValue) {

  if (requestedGlobalID == "") {
    console.log("ID Cannot Be Empty")
    addFriendRequestCallBackValue.value = 5;
    return;
  }

  let UserAuthenticationRef = db.collection('UserAuthentication');
  let phoneDoc = await UserAuthenticationRef.where('userPhone', '==', requestedGlobalID).get();
  if (!phoneDoc.empty) {
    console.log(phoneDoc.docs[0].id, " is owner the telephone number")
    requestedGlobalID = phoneDoc.docs[0].id;
    addFriendRequestCallBackValue.requestedGlobalID = requestedGlobalID;
  }

  if (requestOwnerGlobalID == requestedGlobalID) {
    console.log("You cannot be friends with yourself")
    addFriendRequestCallBackValue.value = 4;
    return;
  }

  let doc = await db.collection('Users').doc(requestedGlobalID).get();

  if (doc.exists) {
    if (doc.data().userFriends.includes(requestOwnerGlobalID)) {
      console.log("Users are already friends")
      addFriendRequestCallBackValue.value = 2;
      return;
    } else {
      if (doc.data().playerSocketID != "") {
        console.log("Users became friends");
        addFriendRequestCallBackValue.value = 0;
        addFriendRequestCallBackValue.requestedFriendSocketID = doc.data().playerSocketID;
        return;
      } else {
        console.log("Requested Friend is Not Online");
        addFriendRequestCallBackValue.value = 3;
        return;
      }
    }
  }
  else {
    console.log("User not found")
    addFriendRequestCallBackValue.value = 1;
    return;
  }

}
function connect() {
  console.log('Client connected');
}
async function disconnect(socket) {
  console.log('Client disconnected');
  if (Players.has(socket.id)) {
    await databasePlayerDisconnect(Players.get(socket.id));
    removePlayerFromRoom(socket);
    playerRemove(socket.id);
  }
}
async function login(userEmail, password, socket, botRoomID) {
  console.log("Login Request ", userEmail, password)
  let loginValue = new Object();
  var playerGlobalID = await databaseGetPlayerGlobalID(userEmail, password, loginValue);
  if (playerGlobalID) {
    console.log("Player was logged ", userEmail);

    await databasePlayerConnect(playerGlobalID, socket.id);
    let player = await databaseGetPlayer(playerGlobalID);

    playerAdd(socket.id, player);

    let roomID = Date.now().toString(); //unique room id

    if (player.isItBot)
      roomID = botRoomID;

    PlayerUpdate(socket.id);

    addPlayerToRoom(roomID, socket);

    NextTournamentUpdate(NextTournament, socket.id);

  }
  console.log("loginValues ", loginValue.type);
  return loginValue.type;
}

async function signUp(playerName, userEmail, userPhone, password, isItBot) {
  console.log("signUp ", playerName, userEmail, password);
  return await databaseCreateGlobalID(playerName, userEmail, userPhone, password, isItBot);
}
async function databaseGetPlayerGlobalID(userEmail, password, loginValue) {
  console.log("databaseGetPlayerGlobalID ", userEmail, password);

  let snapshot = await db.collection('UserAuthentication').where('userEmail', '==', userEmail).get();

  if (snapshot.size > 0) {
    if (snapshot.docs[0].data()["password"] == password) {
      let _player = await databaseGetPlayer(snapshot.docs[0].id)
      if (_player.playerSocketID == "") {
        console.log("User Logged");
        loginValue.type = 0;
        return snapshot.docs[0].id;
      } else {
        console.log("This User Is Already Online");
        loginValue.type = 3;
      }

    } else {
      console.log("Password Is Wrong");
      loginValue.type = 1;
    }
  } else {
    console.log("User Not Registered");
    loginValue.type = 2;
  }
}

async function databaseGetPlayer(playerglobalID) {
  console.log("databaseGetPlayer ", playerglobalID);
  let snapshot = await db.collection('Users').doc(playerglobalID).get();
  return playerCreate(
    snapshot.data()["playerName"],
    snapshot.data()["playerGlobalID"],
    "",
    snapshot.data()["personalRoomName"],
    snapshot.data()["playerSocketID"],
    snapshot.data()["playerScores"],
    snapshot.data()["playerAvatar"],
    snapshot.data()["isItBot"],
  )
}

async function databaseCreateGlobalID(playerName, userEmail, userPhone, password, isItBot) {
  console.log("databaseCreateGlobalID ", playerName, userEmail, userPhone, password);
  let playerGlobalID = Date.now().toString(); //unique playerGlobalID
  let snapshotPhone = await db.collection('UserAuthentication').where('userPhone', '==', userPhone).get();
  if (snapshotPhone.size == 0) {
    let snapshot = await db.collection('UserAuthentication').where('userEmail', '==', userEmail).get();
    if (snapshot.size == 0) {
      let docRef = db.collection('UserAuthentication').doc(playerGlobalID);
      await docRef.set({
        userEmail: userEmail,
        password: password,
        userPhone: userPhone
      });
      await databaseCreatePlayer(playerName, playerGlobalID, isItBot)
      return 0;
    } else {
      console.log("There is already the email adress");
      return 1;
    }
  } else {
    console.log("There is already the phone number");
    return 2;
  }
}

async function databaseCreatePlayer(playerName, playerGlobalID, isItBot) {
  console.log("databaseCreatePlayer ", playerName, playerGlobalID);
  let docRef = db.collection('Users').doc(playerGlobalID);
  await docRef.set({
    playerName: playerName,
    playerGlobalID: playerGlobalID,
    userFriends: [],
    personalRoomName: playerName + "'s Room",
    playerSocketID: "",
    playerScores: playerScoresCreate(playerGamesNoScoreCreate(Games.length), 0, 0, 0, 0, 0, 0, 0, 0),
    playerAvatar: 0,
    isItBot: isItBot
  });
  console.log("Created User");
}

function updateRoom(roomID) {
  console.log("TournamentRooms Container " + mapToJson(TournamentRooms));
  if (Rooms.has(roomID)) {
    io.to(roomID).emit('updateRoom', mapToJson(getRoom(roomID)));
    console.log("updateRoom ", mapToJson(getRoom(roomID)));
  }
}

function playerAdd(playerSocketID, player) {
  let _player = cloneDeep(player);

  Players.set(playerSocketID, _player);
  console.log("Player Add");
  console.log("Players Container " + mapToJson(Players));
}

function playerRemove(playerSocketID) {
  Players.delete(playerSocketID,);
  console.log("Player Remove");
  console.log("Players Container " + mapToJson(Players));
}

function newRoom(roomID, roomName) {
  let players = new Map();
  let room = roomCreate(roomID, roomName, players, false, "", null);
  Rooms.set(roomID, room);

  console.log("New Room");
  console.log("Rooms Container " + mapToJson(Rooms));
}

function removeRoom(roomID) {
  if (Rooms.get(roomID)["players"].size == 0) {
    if (LookForMatchRoom == roomID) {
      LookForMatchRoom = "";
    }
    if (Rooms.get(roomID).tournamentRoom != null) {
      removeArrayItem(TournamentRooms.get(Rooms.get(roomID).tournamentRoom.tournament.tournamentID), "roomID", roomID);
    }
    Rooms.delete(roomID);
  }

  console.log("Remove Room");
  console.log("Rooms Container " + mapToJson(Rooms));
  console.log("TournamentRooms Container " + mapToJson(TournamentRooms));
}

function addPlayerToRoom(roomID, playerSocket) {

  if (!Rooms.has(roomID)) {
    newRoom(roomID, "");
  }

  playerSocket.join(roomID);
  if (Rooms.get(roomID)["players"].size == 0) {
    Rooms.get(roomID)["roomName"] = Players.get(playerSocket.id)["personalRoomName"];
  }
  Players.get(playerSocket.id)["playerRoomID"] = roomID;

  Rooms.get(roomID)["players"].set(playerSocket.id, Players.get(playerSocket.id));

  updateRoom(roomID);

  console.log("Add Player To Room");
  console.log("Rooms Container " + mapToJson(Rooms));
}

function removePlayerFromRoom(playerSocket) {
  let roomID = Players.get(playerSocket.id)["playerRoomID"];
  Rooms.get(roomID)["players"].delete(playerSocket.id);

  playerSocket.leave(roomID);

  removeRoom(roomID);

  updateRoom(roomID);

  console.log("Remove Player From Room");
  console.log("Rooms Container " + mapToJson(Rooms));
}

function playerCreate(playerName, playerGlobalID, playerRoomID, personalRoomName, playerSocketID, playerScores, playerAvatar, isItBot) {
  return {
    playerName: playerName,
    playerGlobalID: playerGlobalID,
    playerRoomID: playerRoomID,
    personalRoomName: personalRoomName,
    playerSocketID: playerSocketID,
    playerScores: playerScores,
    playerAvatar: playerAvatar,
    isItBot: isItBot
  };
}

function playerGamesNoScoreCreate(numberOfGames) {
  let playerGamesNoScore = [];
  var i;
  for (i = 0; i < numberOfGames; i++) {
    let playerGameScore = { gameName: Games[i].gameName, gameNo: i, playedGamesNumber: 0, avarageScore: 0, highScore: 0 };
    playerGamesNoScore.push(playerGameScore);
  }
  return playerGamesNoScore;
}

function playerScoresCreate(playerGamesNoScore, playerMainScore, playerWeeklyScore, playerSoloWins, playerTotalSoloGames, playerMatchWins, playerTotalMatchGames, playerTournamentWins, playerTotalTournamentGames) {
  return {
    playerGamesNoScore: playerGamesNoScore,
    playerMainScore: playerMainScore,
    playerWeeklyScore: playerWeeklyScore,
    playerSoloWins: playerSoloWins,
    playerTotalSoloGames: playerTotalSoloGames,
    playerMatchWins: playerMatchWins,
    playerTotalMatchGames: playerTotalMatchGames,
    playerTournamentWins: playerTournamentWins,
    playerTotalTournamentGames: playerTotalTournamentGames
  };
}

function roomCreate(roomID, roomName, players, roomIsLookingForOppenent, roomMatchID, tournamentRoom) {
  return { roomID: roomID, roomName: roomName, players: players, roomIsLookingForOppenent: roomIsLookingForOppenent, roomMatchID: roomMatchID, tournamentRoom: tournamentRoom };
}

function CreateTournamentChampion(TCRooms, playedGames, tournamentDate) {

  return { TCRooms: TCRooms, playedGames: playedGames, tournamentDate: tournamentDate };
}

function CreateTCPlayer(playerGlobalID, playerAvatar, playerName) {
  return { playerGlobalID: playerGlobalID, playerAvatar: playerAvatar, playerName: playerName };
}

function CreateTCRoom(TCPlayers, roomName, wonGames) {
  return { TCPlayers: TCPlayers, roomName: roomName, wonGames: wonGames };
}

function getRoom(roomID) {
  let _room = cloneDeep(Rooms.get(roomID));
  return _room;
}

function mapToJsonReplacer(key, value) {
  if (value instanceof Map) {
    if (Array.from(value.entries()).length > 0) {
      let arr = new Array();
      let i;
      for (i = 0; i < Array.from(value.entries()).length; i++) {
        arr.push(Array.from(value.entries())[i][1]);
      }
      return arr;
    }
    return Array.from(value.entries());
  } else {
    return value;
  }
}

function mapToJson(map) {
  let _map = cloneDeep(map);
  return JSON.stringify(_map, mapToJsonReplacer);
}



