'use strict';
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var schema = new mongoose.Schema({
    name: {
        type: String,
        max: 20
    },
    visibleRegions: [{
        ref: 'Region',
        type: Schema.Types.ObjectId,
    }],
    modal: {
        title: String,
        imageUrl: String,
        text: String
    },
    targetRegion: {
        shapeObject: String,
        locationPoints: [],
        radius: Number
    }, 
    transitionRule: {
        type: String
    }
});

mongoose.model('Mapstate', schema);