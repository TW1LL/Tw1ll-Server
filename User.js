"use strict";

let uuid = require('uuid');
let Message = require('./Message');
class User {

    constructor(send) {
        this._id = uuid.v1(); // underscore infers private
        this.public = {
            id: this._id,
            email: null,
            friends: []
        };
        this.messages = [];
        this.socket = null;
        this.sendCallback = send;
    }

    send(message) {
        this.messages.push(message);
        this.sendCallback(message);
    }

    receive(newMessage) {
        this.messages.push(newMessage);
        this.socket.emit("server message receive", newMessage);
    }

    get id() {
        return this._id;
    }
    set id(id) {
    // invalid, cannot change user id
    }
    get email() {
        return this.public.email;
    }
    set email(email) {
        this.public.email = email;
    }
    get friends() {
        return this.public.friends;
    }
    addFriend(friend) {
        this.public.friends.push(friend);
    }
    removeFriend(friendId) {
        this.public.friends.slice(this.public.friends.indexOf(friendId));
    }

    get data() {
        return this.public;
    }

}

module.exports = User;
