'use strict';
var mongoose = require('mongoose');

var schema = new mongoose.Schema({
    name: {
        type: String,
        max: 20
    },
    visibleRegions: {
        type: [mongoose.Schema.Types.ObjectId],
    },
    nextState: {
        type: mongoose.Schema.Types.ObjectId
    },
    modal: {
        title: String,
        imageUrl: String,
        text: String
    },
    transitionCondition: {
        name: String,
        region: mongoose.Schema.Types.ObjectId
    },
});

mongoose.model('MapState', schema);