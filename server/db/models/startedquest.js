'use strict';
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var Quest = mongoose.model('Quest');

var startedQuestSchema = new mongoose.Schema({
    quest: {
        ref: 'Quest', 
        type: Schema.Types.ObjectId
    },
    room: String,
    currentMapState: { 
        Number,
        default: 0
    },
    startDate: {
        type: Date,
        default: Date.now
    } 

});

mongoose.model('StartedQuest', startedQuestSchema);