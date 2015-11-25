'use strict';
var router = require('express').Router();
module.exports = router;
var cors = require('cors');

router.use(cors);

router.use('/members', require('./members'));
router.use('/users', require('./users'));
router.use('/games', require('./games'));

// Make sure this is after all of
// the registered routes!
router.use(function (req, res) {
    res.status(404).end();
});
