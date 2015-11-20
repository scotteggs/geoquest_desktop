'use strict';
var socketio = require('socket.io');
var io = null;

module.exports = function (server) {

    if (io) return io;

    io = socketio(server);

    io.on('connection', function (socket) {
        console.log('We have a new fellow in our quest: ' + socket.id);

        socket.on('disconnect', function() {
        	console.log('We have lost ' + socket.id + ' to the wolves');
        });

        socket.on('hereIAm', function(location, accuracy) {
        	socket.broadcast.emit('fellowLocation', location, accuracy);
        });

    });
    
    return io;

};
