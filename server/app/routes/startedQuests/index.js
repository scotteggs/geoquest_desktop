'use strict';

// This file holds routes that concern quests initiated by a particular user
// The quest instances are saved as 'StartedQuest' documents, and updated
// each time the state progresses. When they complete, they are deleted. 

var router = require('express').Router();
module.exports = router;
var _ = require('lodash');
var mongoose = require('mongoose');
var Promise = require('bluebird');
Promise.promisifyAll(mongoose);
var StartedQuest = mongoose.model('StartedQuest');

router.param('startedQuestId', function(req, res, next, id) {
  StartedQuest.findById(id)
    .then(function(startedQuest) {
      if(!startedQuest) throw new Error('not found!');
      req.startedQuest = startedQuest;
      console.log('startedquest', startedQuest);
      next();
    })
    .then(null, next);
});

// Updates a user's startedQuest object (when the status of the quest changes)
router.put('/:startedQuestId', function (req, res, next) {
  req.startedQuest.currentMapState++;
  req.startedQuest.save()
  .then(function(startedQuest) {
      res.status(201).json(startedQuest);
  });
});

// Deletes a startedQuest by id
router.delete('/:startedQuestId', function(req, res, next){
    req.startedQuest.remove()
    .then(function(){
      res.status(204).end();
    })
    .then(null, next);
});



