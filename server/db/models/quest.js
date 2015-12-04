'use strict';
var mongoose = require('mongoose');
var Schema = mongoose.Schema

var schema = new mongoose.Schema({
    active: {
        type: Boolean,
        default: false
    },
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
    author: {
        ref: 'User', 
        type: Schema.Types.ObjectId
    },
    mapstates: [{
        ref: 'Mapstate', 
        type: Schema.Types.ObjectId
    }],
    regions: [{
        ref: 'Region',
        type: Schema.Types.ObjectId
    }],
    startingstate: {
        ref: 'Mapstate',
        type: Schema.Types.ObjectId
    },
    endingstate: {
        ref: 'Mapstate',
        type: Schema.Types.ObjectId
    },
    currentstate: {
        ref: 'Mapstate',
        type: Schema.Types.ObjectId
    }
});

mongoose.model('Quest', schema);