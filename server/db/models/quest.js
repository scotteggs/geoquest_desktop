'use strict';
var mongoose = require('mongoose');
var Schema = mongoose.Schema

var schema = new mongoose.Schema({
    active: {
        type: Boolean,
        default: false
    },
    shuffle: Boolean,
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
});

schema.virtual('totalDistance').get(function(){
    var totalDistance = 0;
    for (var i = 1; i < this.questSteps.length; i++) {
        var lat1 = this.questSteps[i-1].location[0];
        var lon1 = this.questSteps[i-1].location[1];
        var lat2 = this.questSteps[i].location[0];
        var lon2 = this.questSteps[i].location[1];
        totalDistance += getDistanceFromLatLonInMi(lat1, lon1, lat2, lon2);
    }
    return totalDistance;
});

mongoose.model('Quest', schema);

function getDistanceFromLatLonInMi(lat1,lon1,lat2,lon2) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2-lat1);  // deg2rad below
    var dLon = deg2rad(lon2-lon1); 
    var a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2)
      ; 
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    var d = R * c; // Distance in km
    return d/1.60934; // convert to miles;
}





