'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var Quest = mongoose.model('Quest');

var startedQuestSchema = new mongoose.Schema({
    quest: {},
    room: String,
    currentStepIndex: { 
        type: Number,
        default: 0
    },
    startDate: {
        type: Date,
        default: Date.now
    }
});

mongoose.model('StartedQuest', startedQuestSchema);

