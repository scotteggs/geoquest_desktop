'use strict';
var socketio = require('socket.io');
var io = null;
// Array of namespaces (one for each game), each with an id and an array of rooms
var namespaces = [];

function findNs(gameId) {
    var desiredNs;
    namespaces.forEach(function(ns) {
        if (ns.id == gameId) desiredNs = ns;
    });
    return desiredNs;
}

function createNs(gameId) {
    var ns = {
        id: gameId,
        rooms: [],
        everyone: []  // Everyone in your world (will be split up by room)
    };
    namespaces.push(ns);
    return ns;
}

var count = 0;

module.exports = function (server) {

    if (io) return io;

    io = socketio(server);

    var main = io.of('').on('connection', function (socket) {
        // The client asks to join the namespace for a particular game
        socket.on('joinNs', function(gameId, join_cb) {
            // If a namespace doesn't exists for this game,
            // create one and set all the listeners
            var desiredNs = findNs(gameId);
            console.log('should exist ', desiredNs);
            if (!desiredNs) {   
                desiredNs = createNs(gameId);
                var everyone = desiredNs.everyone;
                var dyn_socket = io.of('/' + gameId)
                .on('connection', function(ns_socket){
                    console.log('fellow connected to ' + desiredNs.id);
                    
                    ns_socket.on('disconnect', function() {
                        everyone = everyone.filter(function(fellow) {
                            return fellow.id !== ns_socket.id;
                        });
                        ns_socket.broadcast.emit('death', ns_socket.id);
                        console.log('We have lost ', ns_socket.id);
                    });

                    ns_socket.on('hereIAm', function(location) {
                        console.log('location', location)
                        var fellow = {id: ns_socket.id, location: location};
                        var haveThem = false;
                        for (var i = 0; i < everyone.length; i++) {
                            if (everyone[i].id === fellow.id) {
                                everyone[i].location = location;
                                haveThem = true;
                            }
                        }
                        if (!haveThem) {
                            ns_socket.emit('yourId', ns_socket.id);
                            ns_socket.emit('yourFellows', everyone);
                            everyone.push(fellow);
                        } 
                        io.of('/' + desiredNs.id).emit('fellowLocation', fellow);
                    });

                 });
            }
            socket.emit('setToJoin', gameId);
        });

    });
    return io;
};


