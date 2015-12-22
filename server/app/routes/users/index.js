'use strict';

var router = require('express').Router();
module.exports = router;
var _ = require('lodash');
var mongoose = require('mongoose');
var Promise = require('bluebird');
Promise.promisifyAll(mongoose);
var User = mongoose.model('User');
var StartedQuest = mongoose.model('StartedQuest');

router.get('/', function(req, res, next){
	User.find()
	.then(function(users) {
		res.json(users);
	})
	.then(null, next);
});

router.param('userId', function(req, res, next, id) {
  User.findById(id)
    .then(function(user) {
      if(!user) throw new Error('not found!');
      req.requestedUser = user;
      next();
    })
    .then(null, next);
});

// Gets all incompleted quest instances initiated by this user
router.get('/:userId/startedQuests', function (req, res, next) {
	if (req.requestedUser._id.toString() === req.user._id.toString()) {
		var questsInProgressForUser = req.requestedUser.startedQuests;
		StartedQuest.find({'_id': {$in: questsInProgressForUser} })
		.then(function(startedQuests) {
			res.status(200).json(startedQuests);
		});
	}
});

// Adds a quest to the users 'startedQuests'
router.post('/:userId/startedQuests', function (req, res, next) {
	if (req.requestedUser._id.toString() === req.user._id.toString()) {
		var theStartedQuest;
		StartedQuest.create(req.body)
		.then(function(startedQuest) {
			theStartedQuest = startedQuest;
			req.requestedUser.startedQuests.push(startedQuest._id);
			return req.requestedUser.save();
		})
		.then(function() {
			res.status(201).json(theStartedQuest);
		});
	}
});

router.post('/signup', function(req, res, next){
	User.create(req.body)
	.then(function(user){
		res.status(201).json(user);
	})
	.then(null, next);
});

