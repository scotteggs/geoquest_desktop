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
var Region = Promise.promisifyAll(mongoose.model('Region'));
var Mapstate = Promise.promisifyAll(mongoose.model('Mapstate'));
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
            distance: 2,
            start: [40.712655, -74.004928],
            author: users[0].id,
            questSteps: [
                {
                    name: 'Map Open',
                    visibleRegions: [],
                    successInfo: {
                        title: 'Welcome to the Brooklyn Bridge Tour',
                        imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
                        text: 'Head on over to the starting point to meet up with your group'
                    },
                    targetRegion: {

                    },
                    transitionRule: 'clientWithinRegion'
                },
                {
                    name: 'Starting Point',
                    visibleRegions: [
                        {
                            locationPoints: [40.712655, -74.004928],
                            radius: 100
                        }
                    ],
                    successInfo: {
                        title: 'You have arrived at the beginning',
                        imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
                        text: 'Welcome to the bridge, wait here for your fellow questers to arrive. Take a quick look around, you\'re currently near city hall and the office of the Manhattan Borough President'
                    },
                    targetRegion: {
                        locationPoints: [40.712655, -74.004928],
                        radius: 100
                    },
                    transitionRule: 'clientWithinRegion'
                },
                {
                    name: 'Bridge Walkway',
                    visibleRegions: [
                        {
                            locationPoints: [40.710884, -74.002919],
                            radius: 50
                        }
                    ],
                    successInfo: {
                        title: 'You are now on the Bridge',
                        imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
                        text: 'You are now on the bridge, please do not fall off'                    
                    },
                    targetRegion: {
                        locationPoints: [40.710884, -74.002919],
                        radius: 50
                    },
                    transitionRule: 'clientWithinRegion'
                },
                {
                    name: 'Bridge Walkway',
                    visibleRegions: [
                        {
                            locationPoints: [40.710884, -74.002919],
                            radius: 50
                        }
                    ],
                    successInfo: {
                        title: 'You are now on the Bridge',
                        imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
                        text: 'You are now on the bridge, please do not fall off'                    
                    },
                    targetRegion: {
                        locationPoints: [40.710884, -74.002919],
                        radius: 50
                    },
                    transitionRule: 'clientWithinRegion'
                },
                {
                    name: 'Tower One',
                    visibleRegions: [
                        {
                            locationPoints: [40.707629, -73.998792],
                            radius: 50
                        }
                    ],
                    successInfo: {
                        title: 'Welcome to tower 1',
                        imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
                        text: 'People got the bends going down under the water to dig the foundation'                    
                    },
                    targetRegion: {
                        locationPoints: [40.707629, -73.998792],
                        radius: 50
                    },
                    transitionRule: 'clientWithinRegion'
                },
                {
                    name: 'Midway',
                    visibleRegions: [
                        {
                            locationPoints: [40.706077, -73.996841],
                            radius: 50
                        }
                    ],
                    successInfo: {
                        title: 'Welcome to the midway point',
                        imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
                        text: 'People got the bends going down under the water to dig the foundation'                    
                    },
                    targetRegion: {
                        locationPoints: [40.706077, -73.996841],
                        radius: 50
                    },
                    transitionRule: 'clientWithinRegion'
                },
                {
                    name: 'Tower Two',
                    visibleRegions: [
                        {
                            locationPoints: [40.704540, -73.994944],
                            radius: 50
                        }
                    ],
                    successInfo: {
                        title: 'Welcome to Tower Two',
                        imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
                        text: 'Tower two was easier to build than tower one. Trust me, it was.'                    
                    },
                    targetRegion: {
                        locationPoints: [40.704540, -73.994944],
                        radius: 50
                    },
                    transitionRule: 'clientWithinRegion'
                },
                {
                    name: 'Bridge End',
                    visibleRegions: [
                        {
                            locationPoints: [40.701132, -73.990630],
                            radius: 50
                        }
                    ],
                    successInfo: {
                        title: 'Welcome to the end of the bridge',
                        imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
                        text: 'You have just walked a pretty long ways. Take the stairs up and to the left to drop down into DUMBO'                    
                    },
                    targetRegion: {
                        locationPoints: [40.701132, -73.990630],
                        radius: 50
                    },
                    transitionRule: 'clientWithinRegion'
                },
            ]   
        },
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
   