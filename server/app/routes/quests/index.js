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
  Quest.findById(id).populate('mapstates').populate('author').populate('startingstate').populate('endingstate').populate('currentstate')
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


router.get('/userquests/:authorId', function (req, res, next) {
  // res.send(req.params.userId);
  Quest.find({author: req.params.authorId})
  .then(function(data){
    res.send(data)
  })
  .then(null, next)
})

router.post('/', function (req, res, next) {
  	Quest.create(req.body)
  	.then(function(newQuest){
  		res.status(201).json(newQuest);
  	})
  	.then(null, next)
})


router.put('/:questId', function(req, res, next) {
    req.quest.set(req.body)
    req.quest.save()
      .then(function(quest) {
        res.status(200).json(quest)
      })
      .then(null, next)
})

router.delete('/:questId', function(req, res, next){
    req.quest.remove()
    .then(function(){
      res.status(204).end()
    })
    .then(null, next)
})