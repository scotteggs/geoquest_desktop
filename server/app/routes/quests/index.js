'use strict';
var router = require('express').Router();
module.exports = router;
var _ = require('lodash');
var mongoose = require('mongoose');
var Quest = mongoose.model('Quest');
var Promise = require('bluebird');
Promise.promisifyAll(mongoose);

router.get('/', function(req, res, next) {
	Quest.find()
	.then(function(quests) {
		res.status(200).json(quests);
	}, function(err) {
		console.log('Unable to process request: ', err);
	});
});

router.param('questId', function(req, res, next, id) {
  Quest.findById(id)
    .then(function(quest) {
      if(!quest) throw new Error('not found!');
      req.quest = quest;
      next();
    })
    .then(null, next);
});

router.get('/:questId', function (req, res, next) {
  res.json(req.quest);
});

router.put('/:questId/review', function(req,res,next){
  req.quest.reviews.push(req.body.reviewToAdd);
  req.quest.save();
  res.json(req.quest);
});

router.get('/userquests/:authorId', function (req, res, next) {
  if (req.user._id.toString() === req.params.authorId.toString()) {
    Quest.find({author: req.params.authorId})
    .then(function(data){
      res.json(data);
    })
    .then(null, next);
  }
});

router.post('/', function (req, res, next) {
  if (req.user._id.toString() === req.body.author.toString()) {
    Quest.create(req.body)
    .then(function(newQuest){
      res.status(201).json(newQuest);
    })
    .then(null, next);
  }
});

router.put('/:questId', function(req, res, next) {
  if (req.user._id.toString() === req.body.author.toString()) {
    req.quest.set(req.body);
    req.quest.save()
      .then(function(quest) {
        res.status(200).json(quest);
      })
      .then(null, next);
    }
});

router.delete('/:questId', function(req, res, next){
  if (req.user._id.toString() === req.quest.author.toString()) {
    req.quest.remove()
    .then(function(){
      res.status(204).end();
    })
    .then(null, next);
  }
});


