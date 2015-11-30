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
    start: {
        type: []
    },
    mapStates: {
        type: [mongoose.Schema.Types.ObjectId]
    },
    regions: {
        type: [mongoose.Schema.Types.ObjectId]
    },
    startingState: {
        type: mongoose.Schema.Types.ObjectId
    },
    endingState: {
        type: mongoose.Schema.Types.ObjectId
    },
    currentState: {
        type: mongoose.Schema.Types.ObjectId
    }
});

mongoose.model('Quest', schema);