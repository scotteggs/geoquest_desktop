'use strict';
var mongoose = require('mongoose');
var Schema = mongoose.Schema

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
        ref: 'MapState', 
        type:[Schema.Types.ObjectId]
    },
    regions: {
        ref: 'Region',
        type: [Schema.Types.ObjectId]
    },
    startingState: {
        ref: 'MapState',
        type: Schema.Types.ObjectId
    },
    endingState: {
        ref: 'MapState',
        type: Schema.Types.ObjectId
    },
    currentState: {
        ref: 'MapState',
        type: Schema.Types.ObjectId
    }
});

mongoose.model('Quest', schema);