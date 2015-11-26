'use strict';
var socketio = require('socket.io');
var mongoose = require('mongoose');
var Game = mongoose.model('Game');
var io = null;
var nameSpaces = [];

// not working because main.js line 14 requires this file and gets nothing, bc module.exports aren't ready yet
Game.find({})
.then(function(games) {
    games.forEach(function(game) {
        nameSpaces.push(io.of('/' + game._id));
    });
    createExports();
});

var everyone  = [];

function createExports() {

    module.exports = function (server) {

        if (io) return io;

        io = socketio(server);

        io.on('connection', function (socket) {
            console.log ('we have a new fellow! ', socket.id);

            socket.on('disconnect', function() {
            	everyone = everyone.filter(function(fellow) {
            		return fellow.id !== socket.id;
            	});
            	socket.broadcast.emit('death', socket.id);
                console.log('We have lost ', socket.id);
            });

            socket.on('hereIAm', function(location) {
            	var fellow = {id: socket.id, location: location};
               	var haveThem = false;
            	for (var i = 0; i < everyone.length; i++) {
            		if (everyone[i].id === fellow.id) {
            			everyone[i].location = location;
            			haveThem = true;
            		}
            	}
            	if (!haveThem) {
            		socket.emit('yourId', socket.id);
            		socket.emit('yourFellows', everyone);
            		everyone.push(fellow);
            	} 
            	io.emit('fellowLocation', fellow);

            });


        });
        
        return io;

    };

}
