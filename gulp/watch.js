'use strict';

var gulp = require('gulp');

var conf = require('./conf');
var paths = conf.paths;
var sourceSets = conf.sourceSets;

gulp.task('watch', ['cleanBuild'], function() {

	// Watch all source sets and rebuild whenever something changes
	Object.keys(sourceSets).forEach(function(sourceSetName) {
		gulp.watch( sourceSets[sourceSetName], ['cleanBuild'] );
	});

});

