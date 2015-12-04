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
            userName: 'testing@fsa.com',
            password: 'password'
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

var seedRegions = function () {
    var regions = [];
    regions[0] = {
        name: 'startingPoint',
        shapeObject: 'L.circle([40.712655, -74.004928], 200)',
        shapeType: 'Circle',
        locationPoints: [40.712655, -74.004928],
        radius: 100,
    };
    regions[1] = {
        name: 'bridgeBegin',
        shapeObject: 'L.circle([40.710884, -74.002919], 50)',
        shapeType: 'Circle',
        locationPoints: [40.710884, -74.002919],
        radius: 50,
    };
    regions[2] = {
        name: 'towerOne',
        shapeObject: 'L.circle([40.707629, -73.998792], 50)',
        shapeType: 'Circle',
        locationPoints: [40.707629, -73.998792],
        radius: 50,
    };
    regions[3] = {
        name: 'midway',
        shapeObject: 'L.circle([40.706077, -73.996841], 50)',
        shapeType: 'Circle',
        locationPoints: [40.706077, -73.996841],
        radius: 50,
    };
    regions[4] = {
        name: 'towerTwo',
        shapeObject: 'L.circle([40.704540, -73.994944], 50)',
        shapeType: 'Circle',
        locationPoints: [40.704540, -73.994944],
        radius: 50,
    };   
    regions[5] = {
        name: 'bridgeEnd',
        shapeObject: 'L.circle([40.701132, -73.990630], 50)',
        shapeType: 'Circle',
        locationPoints: [40.701132, -73.990630],
        radius: 50,
    }; 
    return Region.createAsync(regions);
}
var seedMapstates = function (regions) {
    var mapstates = [];
    mapstates[0] = 
    {
        name: 'mapOpen',
        modal: {
            title: 'Welcome to the Brooklyn Bridge Tour',
            imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
            text: 'Head on over to the starting point to meet up with your group'
        },
        transitionCondition: {
            name: 'clientWithinRegion'
        }
    };
    mapstates[1] = 
    {
        name: 'startingPoint',
        visibleRegions: [regions[0].id],
        modal: {
            title: 'You have arrived at the beginning',
            imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
            text: 'Welcome to the bridge, wait here for your fellow questers to arrive. Take a quick look around, you\'re currently near city hall and the office of the Manhattan Borough President'
        },
        targetRegion: {
            shapeObject: 'L.circle([40.712655, -74.004928], 200)',
            locationPoints: [40.712655, -74.004928],
            radius: 100
        }
    };
    mapstates[2] = 
    {
        name: 'bridgeBegin',
        visibleRegions: [regions[1].id],
        modal: {
            title: 'You are now on the Bridge',
            imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
            text: 'You are now on the bridge, please do not fall off'
        },
        targetRegion: {
            shapeObject: 'L.circle([40.710884, -74.002919], 50)',
            locationPoints: [40.710884, -74.002919],
            radius: 50
        }
    };
    mapstates[3] = 
    {
        name: 'towerOne',
        visibleRegions: [regions[2].id],
        modal: {
            title: 'Welcome to tower 1',
            imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
            text: 'People got the bends going down under the water to dig the foundation'
        },
        targetRegion: {
            shapeObject: 'L.circle([40.707629, -73.998792], 50)',
            locationPoints: [40.707629, -73.998792],
            radius: 50
        }
    };
    mapstates[4] = 
    {
        name: 'midway',
        visibleRegions: [regions[3].id],
        modal: {
            title: 'Welcome to midway',
            imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
            text: 'the cables used to make this bridge are pretty long... we think.'
        },
        targetRegion: {
            shapeObject: 'L.circle([40.706077, -73.996841], 50)',
            locationPoints: [40.706077, -73.996841],
            radius: 50
        }
    };
    mapstates[5] = 
    {
        name: 'towerTwo',
        visibleRegions: [regions[4].id],
        nextState: 'bridgeEnd',
        modal: {
            title: 'Welcome to towerTwo',
            imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
            text: 'Tower two was easier to build than tower one. Trust me, it was.'
        },
        targetRegion: {
            shapeObject: 'L.circle([40.704540, -73.994944], 50)',
            locationPoints: [40.704540, -73.994944],
            radius: 50
        }
    };
    mapstates[6] = 
    {
        name: 'bridgeEnd',
        visibleRegions: [regions[5].id],
        modal: {
            title: 'Welcome to the end of the bridge',
            imageUrl: 'http://philhaberphotography.photoshelter.com/image/I0000CXCpZOo.6Kg',
            text: 'You have just walked a pretty long ways. Take the stairs up and to the left to drop down into DUMBO'
        },
        targetRegion: {
            shapeObject: 'L.circle([40.701132, -73.990630], 50)',
            locationPoints: [40.701132, -73.990630],
            radius: 50
        }
    }
    
    return Mapstate.createAsync(mapstates);
}

var seedQuests = function (mapstates, regions, users) {
    var quests = [
        {
            name: 'Brooklyn Bridge Crossing',
            summary: 'A jaunt over this civil engineering landmark',
            time: '1',
            distance: '2',
            start: [40.712655, -74.004928],
            author: users[0].id,
            regions: [regions[0].id, regions[1].id, regions[2].id, regions[3].id, regions[4].id, regions[5].id],
            mapstates: [mapstates[0].id, mapstates[1].id, mapstates[2].id, mapstates[3].id, mapstates[4].id, mapstates[5].id, mapstates[6].id],
            startingstate: mapstates[0].id,
            endingstate: mapstates[6].id,
            currentstate: mapstates[0].id
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
            var regions;
            var users;
            var mapstates;
            return seedUsers()
        .then(function(_users) {
            users = _users;
            return seedRegions()
        })
        .then(function(_regions) {
            regions = _regions;
            return seedMapstates(regions);
        })
        .then(function(_mapstates) {
            mapstates = _mapstates;
            return seedQuests(mapstates, regions, users);
        }).then(function () {
            console.log(chalk.green('Seed successful!'));
            process.kill(0);
        }).catch(function (err) {
            console.error(err);
            process.kill(1);
        });
    })
})
   