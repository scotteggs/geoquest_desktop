/*

This seed file is only a placeholder. It should be expanded and altered
to fit the development of your application.

It uses the same file the server uses to establish
the database connection:
--- server/db/index.js

The name of the database used is set in your environment files:
--- server/env/*

This seed file has a safety check to see if you already have users
in the database. If you are developing multiple applications with the
fsg scaffolding, keep in mind that fsg always uses the same database
name in the environment files.

*/

var mongoose = require('mongoose');
var Promise = require('bluebird');
var chalk = require('chalk');
var connectToDb = require('./server/db');
var User = Promise.promisifyAll(mongoose.model('User'));
var Game = Promise.promisifyAll(mongoose.model('Game'));

var seedUsers = function () {
    var users = [
        {
            email: 'testing@fsa.com',
            password: 'password'
        },
        {
            email: 'obama@gmail.com',
            password: 'potus'
        }
    ];
    return User.createAsync(users);
};

var seedGames = function () {
    var games = [
        {
            name: 'Tour of Olde Shit',
            summary: 'Check out cool historical stuff in the area',
            time: '1.5',
            distance: '2',
            zip: '10018'
        },
        {
            name: 'Kill the Thing',
            summary: 'Go to the place and stab the monsters.',
            time: '1',
            distance: '1.5',
            zip: '10003'
        },
        {
            name: 'Save the Princess',
            summary: 'She\'s being forced into an unsavory marriage',
            time: '1.5',
            distance: '3',
            zip: '20002'
        },
        {
            name: 'Destroy the ring',
            summary: '\"Cast it into the fountain!\"',
            time: '1',
            distance: '2',
            zip: '90001'
        },
        {
            name: 'Ye Classic Drinking Quest',
            summary: 'Get proper pissed in the friendliest bars in town',
            time: '???',
            distance: '1',
            zip: '99501'
        },
        {
            name: 'Escape the Trolls!',
            summary: 'If you seek some exercise',
            time: '1',
            distance: '5',
            zip: '10026'
        }
    ];
    return Game.createAsync(games);
};

connectToDb.then(function () {
    return User.remove({});
}).then(function(){
    return seedUsers();
}).then(function(){
    return Game.remove({});
}).then(function (users) {
    return seedGames();
}).then(function () {
    console.log(chalk.green('Seed successful!'));
    process.kill(0);
}).catch(function (err) {
    console.error(err);
    process.kill(1);
});
