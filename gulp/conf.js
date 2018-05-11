'use strict';

var paths = exports.paths = {
    src: './src/',
    dist: './dist/',
    tmp: './.tmp/',
    bower: './bower_components/'
};

exports.sassOptions = {
	outputStyle: 'compressed'
};

exports.sourceSets = {
	js: [
		paths.src + 'beryllium.module.js',
        '!' + paths.src + 'vendor/**/*.js',
		paths.src + '*/**/*.js'
	],
	bowerComponentsJs: [
		paths.bower + 'angular/angular.min.js',
		paths.bower + 'angular-animate/angular-animate.min.js',
		paths.bower + 'angular-aria/angular-aria.min.js',
		paths.bower + 'angular-bootstrap/ui-bootstrap.min.js',
		paths.bower + 'angular-bootstrap/ui-bootstrap-tpls.min.js',
		paths.bower + 'angular-messages/angular-messages.min.js',
		paths.bower + 'angular-sanitize/angular-sanitize.min.js',
        paths.bower + 'angular-sortable-view/src/angular-sortable-view.min.js',
		paths.bower + 'angular-material/angular-material.min.js',
		paths.bower + 'moment/min/moment.min.js',
		paths.bower + 'jquery/dist/jquery.min.js', // required for bootstrap.js, must come before
		paths.bower + 'bootstrap/dist/js/bootstrap.min.js',
		paths.bower + 'json3/lib/json3.min.js',
		paths.bower + 'lz-string/index.js',
		paths.bower + 'Split.js/split.min.js',
        paths.bower + 'moment/min/moment.min.js',
        paths.bower + 'moment-strict/moment-strict.js',
		paths.bower + 'moment-timezone/builds/moment-timezone-with-data.js',
        paths.bower + 'highstock-release/adapters/standalone-framework.js',
        paths.bower + 'highstock-release/highstock.js',
        paths.bower + 'highstock-release/highcharts-more.js',
        paths.bower + 'highstock-release/modules/exporting.js',
        paths.bower + 'highstock-release/modules/offline-exporting.js',
        paths.bower + 'lasp-datepicker/dist/lasp-datepicker.js',
        paths.bower + 'lasp-highstock/dist/lasp-highstock.js'
	],
	bowerComponentsCss: [
		paths.bower + 'angular-material/angular-material.min.css',
        paths.bower + 'animate-css/index.css',
		paths.bower + "bootstrap/dist/css/bootstrap.min.css",
        paths.bower + 'lasp-highstock/dist/lasp-highstock.css'
	],
	bowerComponentsFonts: [
		paths.bower + 'bootstrap/dist/fonts/*'
	],
	img: paths.src + 'img/**/*',
	staticFiles: [
        paths.src + 'vendor/**/*'
	],
	templates: paths.src + '**/*.html',
	scss: paths.src + '**/*.scss'
};

exports.cleanDirs = [
    paths.dist
];

