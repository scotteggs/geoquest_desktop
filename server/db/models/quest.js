'use strict';
var mongoose = require('mongoose');
var Schema = mongoose.Schema

var schema = new mongoose.Schema({
    name: {
        type: String,
        maxlength: 30
    },
    summary: {
        type: String
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
    questSteps: [{
        name: {
            type: String,
            maxlength: 20
        },
        visibleRegions: [{
            locationPoints: [Number],
            radius: Number
        }],
        successInfo: {
            title: String,
            imageUrl: String,
            text: String
        },
        targetRegion: {
            locationPoints: [Number],
            radius: Number
        },
        transitionRule: {
            type: String
        }
    }]
});

mongoose.model('Quest', schema);