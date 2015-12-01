'use strict';
var router = require('express').Router();
module.exports = router;
var _ = require('lodash');
var mongoose = require('mongoose');
var User = mongoose.model('User');

router.get('/', function(req, res, next){
	User.find()
	.then(function(users) {
		res.json(users)
	})
	.then(null, next)
})

router.post('/signup', function(req, res, next){
	User.create(req.body)
	.then(function(user){
		res.status(201).json(user);
	})
	.then(null, next);
})
