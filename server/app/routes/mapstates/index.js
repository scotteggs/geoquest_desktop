'use strict';
var router = require('express').Router();
var _ = require('lodash');
var mongoose = require('mongoose');
var Mapstate = mongoose.model('Mapstate');
module.exports = router;

router.get('/', function(req, res, next) {
	Mapstate.find()
	.then(function(mapstates) {
		res.status(200).json(mapstates);
	}, function(err) {
		console.log('Unable to process request: ', err);
	});
});


router.param('mapstateId', function(req, res, next, id) {
  Mapstate.findById(id)
    .then(function(mapstate) {
      if(!mapstate) throw new Error('not found!')
      req.mapstate = mapstate
      next()
    })
    .then(null, next)
})


router.get('/:mapstateId', function (req, res, next) {
	res.json(req.mapstate)
})


router.post('/', function (req, res, next) {
  	Mapstate.create(req.body)
  	.then(function(newMapState){
  		res.status(201).json(newMapState);
  	})
  	.then(null, next)
})


router.put('/:mapstateId', function(req, res, next) {
    req.mapstate.set(req.body)
    req.mapstate.save()
      .then(function(mapstate) {
        res.status(200).json(mapstate)
      })
      .then(null, next)
})

router.delete('/:mapstateId', function(req, res, next){
    req.mapstate.remove()
    .then(function(){
      res.status(204).end()
    })
    .then(null, next)
})