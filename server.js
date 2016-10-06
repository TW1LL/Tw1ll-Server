"use strict";
let fs = require('fs');
let express = require('express');
let app = express();
let jwt = require('jsonwebtoken');
let jwtIO = require('socketio-jwt');
let options = {
    key: fs.readFileSync('./https/file.pem'),
    cert: fs.readFileSync('./https/file.crt')
};
let http = require('https').createServer(options, app);
let io = require('socket.io')(http);
let Log = require('./Log'),
    User = require('./User'),
    Message = require('./Message'),
    Conversation = require('./Conversation');

let config = {
    serverPort: 443,
    logLevel: "high"
};
let usersOnline = {}, users = {};
let events = {
    serverEvents: "server events",
    serverUserConnect: "server user connect",
    serverUserDisconnect: "server use disconnect",
    serverUserList: "server user list",
    serverUserData: "server user data",
    serverUserFriendsList: "server send friends list",
    serverMessageReceive: "server message receive",
    serverConversationData: "server conversation data",
    clientMessageSend: "client message send",
    clientUserData: "client user data",
    clientConversationCreate: "client conversation create",
    clientUserList: "client user list",
    clientUserFriendAdd: "client user friend add",
    clientUserFriendRemove: "client user friend remove",
    clientConversationSync: "client conversation sync",
};

let db = require('./db/Database');
let log = new Log(config.logLevel);

http.listen(config.serverPort, function() {
    log.event('HTTPS server started. Listening on port ' + config.serverPort);
});

app.use(express.static(__dirname + '/public'));

app.post('/login/:email/:pass', function (req,res) {
    log.event('Authorizing user...');
    let data = {email: req.params.email, password: req.params.pass};
    db.User.authorize(data).then((auth) => res.json(auth));
});

app.post('/register/:email/:pass', function (req,res) {
    log.event('Registering user...');
    db.User.register(req.params)
    .then(db.User.authorize.bind(db.User))
    .then((auth) => {
        auth.userList = db.User.prepareAll();
        res.json(auth);
    });
});

io.on('connection', jwtIO.authorize({
    secret: 'super_secret code',
    timeout: 30000
}));

io.on('authenticated', connectSocket);


function connectSocket(socket) {
    let user = users[socket.decoded_token.id];
    usersOnline[user.id] = user.data;
    user.socket = socket;
    log.event(user.email+" connected.");
    socket.emit(events.serverEvents, events);
    socket.emit(events.serverUserData, sendUserData(user));
    socket.broadcast.emit(events.serverUserConnect, user.data);
    socket.on(events.clientConversationSync, syncConversations);
    socket.on(events.clientUserFriendAdd, addFriends);
    socket.on(events.clientUserList, sendUserList);
    socket.on(events.clientMessageSend,  (message) => { users[message.from].send(message); });
    socket.on(events.clientConversationCreate, createConversation);
    socket.on("disconnect", function () {
        log.event("User " + user.email + " disconnected");
        delete usersOnline[user.id];
    });
}

function createConversation(conversationRequest){
    let members = [];
    for (let i in conversationRequest.users) {
        members[i] = users[conversationRequest.users[i]].email;
    }
    let name = members.join(", ");

    let conversation = null;
    new Promise((resolve, reject) => {
        db.Conversation.findByMembers(conversationRequest.users)
            .then((existing) => {
                if (existing){
                    conversation = new Conversation(existing.members, existing.name, existing.id);
                    return resolve(conversation);
                } else {
                    conversation = new Conversation(conversationRequest.users, name);
                    db.Conversation.create(conversation.id, conversationRequest.users).then(()=>{
                        return resolve(conversation);
                    });
                }
            });
    }).then((conv) => {
            users[conversationRequest.userId].socket.emit(events.serverConversationData, conv)
        }
    );
}

function send(message){
    log.message(users[message.from].email + " > " + users[message.conversationId].email);
    db.Conversation.getById(message.conversationId)
        .then((row) => {
        for (let user in row.users){
            user.receive(message);
        }
        db.Message.create(message);
    });
}

function sendUserData(user) {
    let data = {};
    data.userData = user.data;
    data.friendsList = createFriendsList(user);
    return data;
}

function sendUserList(id) {
    users[id].socket.emit(events.serverUserList, db.User.prepareAll());
}

function createUserList() {
    let list = {};
    for(var id in users) {
        list[id] = users[id].data;
    }
    return list;
}

function createFriendsList(user) {
    log.recurrent("Creating friends list for " + user.id);
    let list = {};
    for(let id in user.friends) {
        let friend = users[user.friends[id]];
        list[friend.id] = friend.data;
    }
    return list;
}

function addFriends(data){
    log.event("Adding friends");
    let user = users[data.id];
    if (user.friends === null) {
        user.public.friends = [];
    }
    let friends = user.friends;
    data.friends.forEach((friend) => {
        if (!friends.includes(friend)) {
            user.addFriend(friend);
        }
    });
    user.socket.emit(events.serverUserFriendsList, createFriendsList(user));
    db.User.saveFriends(user)
}

function syncConversations(conversations) {
    let user = conversations[0];
    let clientConvs = conversations[1];
    log.recurrent("Syncing conversations for " + user.id);
    log.debug(clientConvs);
    // get conversations from server
    let serverConvs = users[user.id].conversations;
    let missingConvs = {};
    for (let convId in serverConvs) {
        if (convId in clientConvs) {
            let clientMessages = clientConvs[convId];
            for (let message in serverConvs[convId]){
                if (!clientMessages.contains(message)){
                    missingConvs[convId] = serverConvs[convId];
                    break;
                }
            }
        } else {
            missingConvs[convId] = serverConvs[convId];
        }
    }
}
