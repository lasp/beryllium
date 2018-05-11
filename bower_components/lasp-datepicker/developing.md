# Development Overview

## Prerequisites:
1. Install nodejs and npm
2. Install Gulp globally if you haven't already
    `npm install -g gulp`
3. Run `npm install` in the root of this project

## Test Server (`gulp serve`)

This project comes with a test server for developing locally, without of a parent project.

* To run the code inside our test page: `gulp serve`
    * This should open a browser pointing to
    	[http://localhost:3000/test-page/](http://localhost:3000/test-page/). If not, you can
    	navigate there yourself in the browser.
    * The test page will auto-reload whenever you change a js, css, or html file in `./src/` or
    	`./test-page`

## Unit Tests (`gulp test`)

* To run the unit tests:
    1. `gulp test`

## Committing

Don't forget to commit the built files (in `./dist`) as well as the raw source files (in `./src/`)!

