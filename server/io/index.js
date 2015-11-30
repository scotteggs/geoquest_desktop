'use strict';
var socketio = require('socket.io');
var io = null;
// Array of namespaces (one for each game), each with an id and an array of rooms
var namespaces = [];

function findNs(questId) {
    var desiredNs;
    namespaces.forEach(function(ns) {
        if (ns.id == questId) desiredNs = ns;
    });
    return desiredNs;
}

function createNs(questId) {
    var ns = {
        id: questId,
        rooms: []
    };
    namespaces.push(ns);
    return ns;
}

function createRoom(ns) {
    var roomId = Date.now();
    var desiredRoom = {
        id: roomId,
        everyone: []
    };
    ns.rooms.push(desiredRoom);
    return desiredRoom;
}

function findRoom(ns, roomId) {
    var desiredRoom;
    ns.rooms.forEach(function(room) {
        if (room.id == roomId) desiredRoom = room;
    });
    return desiredRoom;
}

module.exports = function (server) {

    if (io) return io;

    io = socketio(server);

    // On general, base connection
    io.of('').on('connection', function (socket) {
        // The client asks to join the namespace for a particular game
        socket.on('joinNs', function(questId) {
        // If a namespace doesn't exists for this game,
        // create one and set all the listeners (including ability
        // to dynamically create rooms within the namespace)
            var ns = findNs(questId);
            if (!ns) {   
                ns = createNs(questId);
                io.of('/' + questId)
                .on('connection', function(nsSocket){
                    console.log('fellow connected to ' + ns.id);
                    var everyone;
                    var room;
                    // This happens when they enter a code, before they get to the map state
                    // If no roomId specified, a new room will be created,
                    // and the client joined to it, and sent the id. 
                    nsSocket.on('joinRoom', function(roomId) {
                        // Now they join a room in this namespace, which will be an instance of a quest
                        // Fellows only share info with others in this room, never across the entire namespace
                        var newRoom = false;
                        if (!roomId) {
                            room = createRoom(ns);
                            newRoom = true;
                        } else {
                            room = findRoom(ns, roomId);
                        }
                        everyone = room.everyone;
                        // Join client to room, and tell them whether it's new or not
                        // If room is new, client will go directly to map without choosing fellows
                        nsSocket.join(room.id);
                        nsSocket.emit('joinedRoom', {room: room.id, newRoom: newRoom});
                        console.log('fellow connected to room ' + room.id);
                    });

                    nsSocket.on('disconnect', function() {
                        var ind;
                        for (var i = 0; i < everyone.length; i++) {
                            if (everyone[i].id == nsSocket.id) ind = i;
                        }
                        everyone.splice(ind,1);
                        nsSocket.broadcast.to(room.id).emit('death', nsSocket.id);
                        console.log('We have lost ', nsSocket.id);
                    });

                    nsSocket.on('hereIAm', function(location) {
                        var fellow = {id: nsSocket.id, location: location};
                        var haveThem = false;
                        for (var i = 0; i < everyone.length; i++) {
                            if (everyone[i].id === fellow.id) {
                                everyone[i].location = location;
                                haveThem = true;
                            }
                        }
                        if (!haveThem) {
                            nsSocket.emit('yourId', nsSocket.id);
                            nsSocket.emit('yourFellows', everyone);
                            everyone.push(fellow);
                        } 
                        io.of('/' + ns.id).to(room.id).emit('fellowLocation', fellow);
                     });
                });
            }
            socket.emit('setToJoinNs', questId);
        });
    });
    return io;
};


