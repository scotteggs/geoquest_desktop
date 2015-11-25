'use strict';
var socketio = require('socket.io');
var io = null;

var everyone  = [];

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