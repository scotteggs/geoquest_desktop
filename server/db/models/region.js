'use strict';
var mongoose = require('mongoose');

var schema = new mongoose.Schema({
    name: {
        type: String
    },
    shapeObject: {
        type: String
    },
    shapeType: {
        type: String,
        enum: ['Polygon', 'Circle']
    },
    location: {
        type: []
    },
    radius: {
        type: Number
    },
    locationPoints: {
        type: []
    }
});

mongoose.model('Region', schema);