'use strict';

var conf = require("./gulp/conf");
var path = require("path");

module.exports = function(config) {

  var files = [
    'node_modules/angular/angular.js',
    'node_modules/angular-mocks/angular-mocks.js',

    'bower_components/highstock-release/adapters/standalone-framework.js',
    'bower_components/highstock-release/highstock.js',
    'bower_components/highstock-release/highcharts-more.js',
    'bower_components/angular-bootstrap/ui-bootstrap-tpls.min.js',
    'bower_components/moment/min/moment.min.js',
    'bower_components/moment-timezone/builds/moment-timezone-with-data.min.js',

    conf.paths.dist + "lasp-highstock.js"
  ];

  files = files.concat(conf.sourceSets.unitTests);

  var configuration = {
    files: files,
    singleRun: true,
    autoWatch : false,
    frameworks: ['jasmine'],
    browsers : ['PhantomJS'],
    plugins : [
      'karma-phantomjs-launcher',
      'karma-jasmine'
    ]
  };

  config.set(configuration);
};
