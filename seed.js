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
var Quest = Promise.promisifyAll(mongoose.model('Quest'));

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

var seedQuests = function () {
    var quests = [
        {
            name: 'Tour of Olde Shit',
            summary: 'Check out cool historical stuff in the area',
            time: '1.5',
            distance: '2',
            start: [40.713031, -74.009896]
        },
        {
            name: 'Kill the Thing',
            summary: 'Go to the place and stab the monsters.',
            time: '1',
            distance: '1.5',
            start: [66.664463, -150.225470]
        },
        {
            name: 'Save the Princess',
            summary: 'She\'s being forced into an unsavory marriage',
            time: '1.5',
            distance: '3',
            start: [37.752731, -122.450657]
        },
        {
            name: 'Destroy the ring',
            summary: '\"Cast it into the fountain!\"',
            time: '1',
            distance: '2',
            start: [40.840256, -73.924791]
        },
        {
            name: 'Ye Classic Drinking Quest',
            summary: 'Get proper pissed in the friendliest bars in town',
            time: '???',
            distance: '1',
            start: [40.745645, -73.978349]
        },
        {
            name: 'Escape the Trolls!',
            summary: 'If you seek some exercise',
            time: '1',
            distance: '5',
            start: [40.930791, -74.275668]
        }
    ];
    return Quest.createAsync(quests);
};

connectToDb.then(function () {
    return User.remove({});
}).then(function(){
    return seedUsers();
}).then(function(){
    return Quest.remove({});
}).then(function () {
    return seedQuests();
}).then(function () {
    console.log(chalk.green('Seed successful!'));
    process.kill(0);
}).catch(function (err) {
    console.error(err);
    process.kill(1);
});
