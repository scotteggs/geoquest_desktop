'use strict';
var router = require('express').Router();
module.exports = router;
var _ = require('lodash');
var mongoose = require('mongoose');
var Quest = mongoose.model('Quest');

router.get('/', function(req, res, next) {
	Quest.find()
	.then(function(quests) {
		res.status(200).json(quests);
	}, function(err) {
		console.log('Unable to process request: ', err);
	});
});


router.param('questId', function(req, res, next, id) {
  Quest.findById(id).populate('MapState', 'Region')
    .then(function(quest) {
      if(!quest) throw new Error('not found!')
      req.quest = quest
      next()
    })
    .then(null, next)
})


router.get('/:questId', function (req, res, next) {
	res.json(req.quest)
})