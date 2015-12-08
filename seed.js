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
            userName: '123',
            password: '123'
        },
        {
            userName: 'joe@geoquest.com',
            password: 'password'
        },
        {
            userName: 'scott@geoquest.com',
            password: 'password'
        },
        {
            userName: 'will@geoquest.com',
            password: 'password'
        },

    ];
    return User.createAsync(users);
};


var seedQuests = function (users) {
    var quests = [
        {
            name: 'Brooklyn Bridge Crossing',
            summary: 'A jaunt over this civil engineering landmark',
            time: 1,
            start: [40.712655, -74.004928],
            author: users[0].id,
            openingInfo: {
                title: 'Welcome to the Brooklyn Bridge Tour',
                text: 'Head on over to the starting point to meet up with your group'
            },
            closingInfo: {
                title: 'We hope you\'ve enjoyed this Tour',
                text: 'Please exit through the gift shop.'
            },
            questSteps: [
                {
                    name: 'Starting Point',
                    transitionInfo: {
                        title: 'You have arrived at the beginning',
                        imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
                        text: 'Welcome to the bridge, wait here for your fellow questers to arrive. Take a quick look around, you\'re currently near city hall and the office of the Manhattan Borough President'
                    },
                    targetCircle: {
                        center
                        : [40.712655, -74.004928],
                        radius: 100
                    },
                    transitionRule: 'clientWithinRegion'
                },
                {
                    name: 'Bridge Walkway',
                    transitionInfo: {
                        title: 'You are now on the Bridge',
                        imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
                        text: 'You are now on the bridge, please do not fall off'                    
                    },
                    targetCircle: {
                        center
                        : [40.710884, -74.002919],
                        radius: 50
                    },
                    transitionRule: 'clientWithinRegion'
                },
                {
                    name: 'Tower One',
                    transitionInfo: {
                        title: 'Welcome to tower 1',
                        imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
                        text: 'People got the bends going down under the water to dig the foundation'                    
                    },
                    targetCircle: {
                        center
                        : [40.707629, -73.998792],
                        radius: 50
                    },
                    transitionRule: 'clientWithinRegion'
                },
                {
                    name: 'Midway',
                    transitionInfo: {
                        title: 'Welcome to the midway point',
                        imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
                        text: 'People got the bends going down under the water to dig the foundation'                    
                    },
                    targetCircle: {
                        center
                        : [40.706077, -73.996841],
                        radius: 50
                    },
                    transitionRule: 'clientWithinRegion'
                },
                {
                    name: 'Tower Two',
                    transitionInfo: {
                        title: 'Welcome to Tower Two',
                        imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
                        text: 'Tower two was easier to build than tower one. Trust me, it was.'                    
                    },
                    targetCircle: {
                        center
                        : [40.704540, -73.994944],
                        radius: 50
                    },
                    transitionRule: 'clientWithinRegion'
                },
                {
                    name: 'Bridge End',
                    transitionInfo: {
                        title: 'Welcome to the end of the bridge',
                        imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
                        text: 'You have just walked a pretty long ways. Take the stairs up and to the left to drop down into DUMBO'                    
                    },
                    targetCircle: {
                        center
                        : [40.701132, -73.990630],
                        radius: 50
                    },
                    transitionRule: 'clientWithinRegion'
                },
            ]   
        }
        
    ];
    return Quest.createAsync(quests);
};

connectToDb.then(function () {
    mongoose.connection.db.dropDatabase(function() {
            var users;
            return seedUsers()
        .then(function(_users) {
            users = _users;
            return seedQuests(users);
        }).then(function () {
            console.log(chalk.green('Seed successful!'));
            process.kill(0);
        }).catch(function (err) {
            console.error(err);
            process.kill(1);
        });
    })
})
