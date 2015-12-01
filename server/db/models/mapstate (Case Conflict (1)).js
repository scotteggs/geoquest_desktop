'use strict';
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var schema = new mongoose.Schema({
    name: {
        type: String,
        max: 20
    },
    visibleRegions: {
        ref: 'Region',
        type: [Schema.Types.ObjectId],
    },
    modal: {
        title: String,
        imageUrl: String,
        text: String
    },
    transitionCondition: {
        name: String,
        region: {
            ref: 'Region',
            type: Schema.Types.ObjectId
        }
    },
});

mongoose.model('Mapstate', schema);