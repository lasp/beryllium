'use strict';

var gulp = require('gulp');
var path = require('path');

var conf = require('./conf');
var paths = conf.paths;
var sourceSets = conf.sourceSets;

gulp.task('clean', function(cb) {
    require('del').sync( conf.cleanDirs );
    cb();
});

gulp.task('build-beryllium-css', function() {

    var concat = require('gulp-concat');
    var autoprefixer = require('gulp-autoprefixer');
    var sass = require('gulp-sass');

    // compile css and add browser prefixes
    return gulp.src( sourceSets.scss )
        .pipe( concat("beryllium.scss") )
        .pipe( sass( conf.sassOptions ).on('error', sass.logError) )
        .pipe( autoprefixer() )
        .pipe( gulp.dest( paths.dist + 'css' ) );
});

gulp.task('build-bower-components-js', function() {

     var concat = require('gulp-concat');

     return gulp.src( sourceSets.bowerComponentsJs )
        .pipe( concat('beryllium-dependencies.js') )
        .pipe( gulp.dest( paths.dist + "js" ) );
});

gulp.task('build-beryllium-js', function() {

    var templateCache = require('gulp-angular-templatecache');
    var addSrc = require('gulp-add-src');
    var minifyHtml = require('gulp-minify-html');
    var concat = require('gulp-concat');

    return gulp.src( sourceSets.templates )
        .pipe( minifyHtml( {
            empty: true, // do not remove empty attributes
            spare: true, // do not remove redundate attributes
            quotes: true // do not remove arbitrary quotes
        } ) )
        .pipe( templateCache( "templates.js", { module: "beryllium" } ) )
        .pipe( addSrc.prepend( sourceSets.js ) )
        .pipe( concat("beryllium.js") )
        .pipe( gulp.dest( paths.dist + 'js' ) );
});

gulp.task('build-all-js', ['build-bower-components-js', 'build-beryllium-js'], function() {

    var concat = require('gulp-concat');

    return gulp.src([
            paths.dist + 'js/beryllium-dependencies.js',
            paths.dist + 'js/beryllium.js'
        ])
        .pipe( concat('beryllium-all.js') )
        .pipe( gulp.dest( paths.dist + 'js' ) );
});

gulp.task('build-bower-components-fonts', function() {
    return gulp.src( sourceSets.bowerComponentsFonts )
        .pipe( gulp.dest( paths.dist + 'fonts' ) );
});

gulp.task('build-bower-components-css', ['build-bower-components-fonts'], function() {

    var concat = require('gulp-concat');

    return gulp.src( sourceSets.bowerComponentsCss )
        .pipe( concat("beryllium-dependencies.css") )
        .pipe( gulp.dest( paths.dist + 'css' ) );
});

gulp.task('build-all-css', ['build-beryllium-css', 'build-bower-components-css'], function() {

    var concat = require('gulp-concat');
    var addSrc = require('gulp-add-src');

    return gulp.src( paths.dist + 'css/beryllium-dependencies.css' )
        .pipe( addSrc( paths.dist + "css/beryllium.css" ) )
        .pipe( concat("beryllium-all.css") )
        .pipe( gulp.dest( paths.dist + 'css' ) );
});

gulp.task('build-img', function() {
    return gulp.src(
        sourceSets.img,
        {
            base: './src'
        }
    ).pipe( gulp.dest(paths.dist) );
});

gulp.task('build-static', function() {
    return gulp.src(
        sourceSets.staticFiles,
        {
            base: './src'
        }
    ).pipe( gulp.dest(paths.dist) );
});

gulp.task('build', [
    'build-all-js',
    'build-all-css',
    'build-img',
    'build-static',
    'build-bower-components-css'
]);

gulp.task('cleanBuild', function(cb) {
    require('run-sequence')('clean', 'build', cb);
});

