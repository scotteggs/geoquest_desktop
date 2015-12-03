'use strict';
var router = require('express').Router();
module.exports = router;
var _ = require('lodash');
var mongoose = require('mongoose');
var Region = mongoose.model('Region');

router.get('/', function(req, res, next) {
	Region.find()
	.then(function(regions) {
		res.status(200).json(regions);
	}, function(err) {
		console.log('Unable to process request: ', err);
	});
});

router.param('regionId', function(req, res, next, id) {
  Region.findById(id)
    .then(function(region) {
      if(!region) throw new Error('not found!')
      req.region = region
      next()
    })
    .then(null, next)
})

router.get('/:regionId', function (req, res, next) {
	res.json(req.region)
}) 

router.post('/', function (req, res, next) {
  	Region.create(req.body)
  	.then(function(newRegion){
  		res.status(201).json(newRegion);
  	})
  	.then(null, next)
})

router.put('/:regionId', function(req, res, next) {
    req.region.set(req.body)
    req.region.save()
      .then(function(region) {
        res.status(200).json(region)
      })
      .then(null, next)
})

router.delete('/:regionId', function(req, res, next){
    req.region.remove()
    .then(function(){
      res.status(204).end()
    })
    .then(null, next)
})