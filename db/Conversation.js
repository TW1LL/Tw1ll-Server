"use strict";

let Log = require('./../Log');
let log = new Log("high");
let Conversation = require('./../Models/Conversation');

class ConversationDB {

    constructor(context) {
        this.context = context;
        this.ready = new Promise((resolve) => {
            this.getAll()
                .then((convs) => {
                    this.all = convs;
                    resolve(true);
                });
        });
    }

    create(id, users, name) {
        log.recurrent("Creating conversation " + name);
        log.debug(id);
        log.debug(users);
        let membersString = users.sort().join(', ');
        return new Promise ((resolve, reject) => {
            this.context.queries.createConversation.run([id, membersString, name, Date.now(), Date.now()])
                .then((result) => {
                if (result.lastID) {
                    return resolve(true);
                } else {
                    return reject(result);
                }
            })
            .catch((err) => log.debug(err));
        })
    }

    findByMembers(members){
        log.recurrent("Retrieving conversation by members" );
        log.debug(members);
        let membersString = members.sort().join(', ');
        return new Promise((resolve, reject) => {
            this.context.queries.retrieveConversationByMembers.get(membersString)
                .then((row) => {
                    if (row) {
                        return resolve(row)
                    } else {
                        return resolve(false)
                    }
                })
                .catch((err) => reject(err))
        })
    }

    get(id) {
        log.recurrent("Retrieving conversation " + id);
        return new Promise ((resolve, reject) => {
            this.context.queries.retrieveConversationById.get(id)
                .then((err, row) => {
                    log.debug(err);
                    log.debug(row);
                    if (row) {
                        return resolve(new ConversationDB(row.members, row.name, row.id));
                    } else {
                        return reject(err);
                    }
                })
        })
    }

    getList(ids){
        log.recurrent("Retrieving conversations " + ids);
        let idString = ids.join(', ');
        return new Promise ((resolve, reject) => {
            this.context.queries.retrieveConversationByIdList.all(idString)
                .then((err, rows) => {
                    log.debug(this);
                    log.debug(err);
                    log.debug(rows);
                    if(rows) {
                        let conversations = {};
                        for (let data in rows){
                            conversations[data.id] = rows[data];
                        }
                        return resolve(conversations);
                    } else {
                        return reject(err);
                    }
                })
        })
    }

    getAll() {
        let getAllConversations = "SELECT * FROM conversations";
        log.event("Getting all conversations");
        return new Promise ((resolve, reject) => {
            this.context.db.all(getAllConversations)
                .then((rows) => {
                    if (rows) {
                        let conversations = {};
                        rows.forEach((row) => {
                            let memberIds = row.members.split(', ');
                            let members = {};
                            memberIds.forEach((val, index, array) => {
                                members[val] = this.context.User.all[val].data;
                            });
                            let conversation = new Conversation(members,
                                row.name,
                                row.id,
                                this.context.Message.getMessagesForConversation(row.id).then((messages) => conversation.messages = messages));
                            conversations[row.id] = conversation;
                        });
                        let messages = [];
                        for (let conv in conversations) {
                            messages.push(conversations[conv].messages);
                        }
                        return Promise.all(messages)
                            .then(() => {resolve(conversations)});
                    } else {
                        return reject("No rows returned");
                    }
            })
            .catch((error) => {console.log(error)})
        })
    }
}

module.exports = ConversationDB;