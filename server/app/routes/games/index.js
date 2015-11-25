'use strict';
var router = require('express').Router();
module.exports = router;
var _ = require('lodash');
var mongoose = require('mongoose');
var Game = mongoose.model('Game');

router.get('/', function(req, res, next) {
	console.log('hi');
	Game.find({})
	.then(function(games) {
		res.status(200).json(games);
	}, function(err) {
		console.log('YOU CANT HAVE THE GAMES: ', err);
	});
});