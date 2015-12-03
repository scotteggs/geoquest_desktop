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
    locationPoints: {
        type: []
    },
    radius: {
        type: Number
    },
});

mongoose.model('Region', schema);