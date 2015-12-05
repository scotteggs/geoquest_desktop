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
        maxlength: 30
    },
    summary: {
        type: String
    },
    time: {
        type: Number
    },
    distance: {
        type: Number
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
        transitionInfo: {
            title: String,
            imageUrl: String,
            text: String,
            question: String,
            answer: String
        },
        targetCircle: {
            center: [Number],
            radius: Number
        },
        transitionRule: {
            type: String
        },
        closingInfo: {
            title: String,
            text: String
        }
    }]
});

mongoose.model('Quest', schema);