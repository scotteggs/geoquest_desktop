'use strict';
var socketio = require('socket.io');
var io = null;

module.exports = function (server) {

    if (io) return io;

    io = socketio(server);

    io.on('connection', function (socket) {
        console.log('We have a new fellow in our quest: ' + socket.id);
    });
    
    return io;

};
