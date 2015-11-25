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
    start: [String]
});

mongoose.model('Game', schema);