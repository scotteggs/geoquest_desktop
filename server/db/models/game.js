'use strict';
var mongoose = require('mongoose');

var schema = new mongoose.Schema({
    name: {
        type: String,
        max: 20
    },
    summary: {
        type: String,
        max: 30
    },
    time: {
        type: String
    },
    distance: {
        type: String
    },
    zip: {
        type: String,
        max: 5,
        min: 5
    }
});

mongoose.model('Game', schema);