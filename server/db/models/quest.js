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
        maxlength: 100
    },
    summary: {
        type: String
    },
    reviews: {
        type: [Number]
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
        answerRequired: {
            type: Boolean
        },
    }],
    closingInfo: {
        title: String,
        text: String
    },
    openingInfo: {
        title: String,
        text: String
    }      
});

schema.virtual('averageReview').get(function(){
    return this.reviews.reduce(function(cur, prev){ return cur + prev }, 0) / this.reviews.length;
})

mongoose.model('Quest', schema);