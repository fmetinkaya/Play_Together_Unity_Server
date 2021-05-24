const io = require("socket.io-client");
const socket = io('http://localhost:3000');
//const socket = io('https://metinsocket.herokuapp.com/');


socket.on('connect', async () => {
  console.log("connected");


  socket.emit('Login', "rahmi1@gmail.com", "password", loginCallBack);
  //socket.emit('Sign Up', 'rahmi',"rahmi1@gmail.com","password",loginCallBack4);
  //socket.emit('AcceptFriend', '1613551395419',"1613552564298");

});
function loginCallBack(data1, data2) {
  console.log("logincallback ", data1, data2);
  //socket.emit('InviteRoomRequest', 'mUkb9BxoavGn2gM6AAAB');
  //socket.emit('GetFriends', '1613746212189', loginCallBack3);
  //socket.emit('AddFriendRequest', '1613746212189', "", loginCallBack2);
}
function loginCallBack2(data) {
  console.log("AddFriendRequest callback ", data);
}
function loginCallBack3(data) {
  console.log("GetFriends callback ", data);
}
function loginCallBack4(data) {
  console.log("Sign Up callback ", data);
}
socket.on('updateRoom', (data, data2) => {
  console.log(data, data2);
  console.log("updateRoom");
});
socket.on('InviteRoomRequested', (requestOwnerName, requestOwnerRoomName, requestedRoomID) => {
  console.log(requestOwnerName, requestOwnerRoomName, requestedRoomID);
  socket.emit('AcceptInviteRoomRequest', requestedRoomID);
});
/*socket.on('FriendshipRequest', (requestOwnerName, requestOwnerGlobalID, requestedGlobalID) => {
  console.log(requestOwnerName, requestOwnerGlobalID, requestedGlobalID);
  console.log("FriendshipRequest");
  socket.emit('AcceptFriend', requestOwnerGlobalID, requestedGlobalID);
});*/