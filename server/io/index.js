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

function findOrCreateRoom(ns, roomId) {
    var desiredRoom;
    ns.rooms.forEach(function(room) {
        if (room.id == roomId) desiredRoom = room;
    });
    if (!desiredRoom) {
        desiredRoom = {
            id: roomId,
            everyone: []
        };
        ns.rooms.push(desiredRoom);
    }
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
                    nsSocket.on('joinRoom', function(roomId) {
                        // Now they join a room in this namespace, which will be an instance of a quest
                        // Fellows only share info with others in this room, never across the entire namespace
                        room = findOrCreateRoom(ns, roomId);
                        everyone = room.everyone;
                        // Join client to room
                        nsSocket.join(room.id);
                        nsSocket.emit('joinedRoom', room.id);
                        console.log('fellow connected to room ' + room.id);
                    });

                    nsSocket.on('disconnect', function() {
                        // Take the client out of the 'everyone' array
                        var ind;
                        for (var i = 0; i < everyone.length; i++) {
                            if (everyone[i].id == nsSocket.id) ind = i;
                        }
                        everyone.splice(ind,1);
                        nsSocket.broadcast.to(room.id).emit('fellowEvent', {callMethod: 'death', deathId: nsSocket.id});
                        console.log('We have lost ', nsSocket.id);
                    });

                    nsSocket.on('hereIAm', function(fellowData) {
                        var fellow = {
                            id: nsSocket.id, 
                            name: fellowData.name, 
                            location: fellowData.location, 
                            currentStepIndex: fellowData.currentStepIndex,
                            color: fellowData.color
                        };
                        var haveThem = false;
                        for (var i = 0; i < everyone.length; i++) {
                            if (everyone[i].id === fellow.id) {
                                everyone[i].location = fellowData.location;
                                haveThem = true;
                            }
                        }
                        if (!haveThem) {
                            nsSocket.emit('yourId', nsSocket.id);   
                            nsSocket.emit('fellowEvent', {callMethod: 'yourFellows', fellows: everyone});
                            everyone.push(fellow);
                        } 
                        io.of('/' + ns.id).to(room.id).emit('fellowEvent', {callMethod: 'fellowLocation', fellow: fellow}); 
                     });
                });
            }
            socket.emit('setToJoinNs', questId);
        });
    });
    return io;
};


