# Beryllium

### Contacts

* **Product Owner:**
	N/A
* **Experienced Devs:**
    * Fernando Sanchez
    * Dylan Nguyen
    * Hunter Leise

### Beryllium Summary

Beryllium contains shared code that is used throughout all Beryllium apps, including
[Beryllium-Maven](https://github.com/lasp/beryllium-maven.git)
and [Beryllium-MMS](https://github.com/lasp/beryllium-mms.git).

### Related Projects

* [beryllium-maven](https://github.com/lasp/beryllium-maven.git):
    Beryllium application for the Maven mission.
* [beryllium-mms](https://github.com/lasp/beryllium-mms.git):
    Beryllium application for the MMS mission.

### Architecture

Beryllium itself provides a handful of Angular components and services for Beryllium apps
to use. The most thorough documentation of what's available can be found in the code comments,
but a few notable examples are listed here:

* The `<cesium></cesium>` component: Renders a CesiumJs Viewer, which does all of the 3D
    work for us. Must be configured by adding custom directives/components in between the
    `<cesium>` tags. Those directives will probably want to require `"^^cesium"` to access
    the `<cesium>` Controller's API (see:
    [require for directives](https://docs.angularjs.org/guide/directive#creating-directives-that-communicate),
    [require for components](https://docs.angularjs.org/guide/component#intercomponent-communication))
* The `AbstractClass` service: provides a global "superclass" to help with prototypal
    inheritance. Used by `AbstractDataProvider`, `AbstractDataTransformer`, and others.
* `DataProviders`s and `DataTransformer`s: Subclasses of `AbstractDataProvider` and
    `AbstractDataTransformer`. Both classes implement the same API so that they can be
    easily interchanged with each other. DataProviders are intended to provide raw data
    to the app (usually via ajax), and DataTransformers are intended to transform the
    raw data into a more usable form (usually
    [Cesium.Property](https://cesiumjs.org/Cesium/Build/Documentation/Property.html)
    instances). DataTransformers can be linked directly to
    DataProviders, or to other DataTransformers to allow complex processing to be broken up
    into steps. Both DataProviders and DataTransformers can have any number of "children"
    ("children" can mean either attached DataTransformers, or visual components that
    display the data, or both. The attachment method is the same in either case).
* `Requirements` and `RequirementsManager` classes: Provide a standard method for
    DataProviders and DataTransformers to request requirements (parameters) from the
    instances that depend on them.
* The `berylliumColors` service: Provides basic utilities for working with color gradients
    (e.g. color interpolation). Provides access to colormaps ripped from
    [matplotlib](http://matplotlib.org/examples/color/colormaps_reference.html).
* The `Latis` class: Provides utility methods for making ajax requests to a latis instance.

### Build System
We use a standard Gulp and Node build system for this project:
	[Gulp](https://gulpjs.com/)
	[Node](https://nodejs.org/en/)

##### Task Cheatsheet

```
gulp build // builds the project to the dist folder
gulp clean // removes dist folder and any/all temporary folders
```

### Running Beryllium

Since Beryllium is just a shared code repository, new changes will need to be tested through
Beryllium-Maven or Beryllium-MMS. To test the local copy of beryllium, you can use the
[bower link](https://bower.io/docs/api/#link) command.

1. In one terminal (you'll need 2 eventually):
    1. `cd beryllium`
    1. `bower link`
        * This installs `beryllium` as a link-able dependency globally on the current machine. You only need to run this once per machine
    1. `gulp watch`
        * Just leave this task running until we're done. You can skip this step and manually `gulp build` every time you make changes if you would like.
1. In another terminal
    1. `cd beryllium-maven` or `cd beryllium-mms`
    1. `bower link beryllium`
        * This replaces `bower_components/beryllium` with a symlink to the `beryllium` repo you installed in the other terminal. Be sure not to commit this symlink.
    1. `gulp serve`
1. Make some easily-visible changes to the `beryllium` project (e.g. change some text in the dateRangePicker component)
    1. Notice that the `gulp watch` task in the first tab automatically rebuilds the `beryllium` project (it happens fast, don't blink!)
    1. Notice that, once `beryllium` has been rebuilt, the `gulp serve` task in the second tab automatically rebuilds the `beryllium-mms` project and reloads your browser tab
    1. Notice that your change is now visible in the browser
1. Kill the running `gulp serve` task (`ctrl+c`)
1. `bower uninstall beryllium` to remove the symlink
1. To reinstall the beryllium code from the master branch, run `bower install`

### Deploying Beryllium

Since Beryllium-Maven and Beryllium-MMS are connected to the master branch of the Beryllium repository,
simply push your most recent Beryllium code to the master branch. After running `bower update beryllium` in the Beryllium-Maven
or Beryllium-MMS project command line, the beryllium bower component will include your most recent changes.

### FAQs and Help

For questions please contact LASP Web Team.

##### Beryllium-specific common issues, gotchas

> None yet

### External Resources

* [CesiumJS Sandcastle](http://cesiumjs.org/Cesium/Apps/Sandcastle/index.html?src=Hello%20World.html&label=Showcases):
	This has lots of useful feature demos. If you need to implement something and you don't know
	what the right class is, this is a useful place to look.
* [CesiumJS API reference](http://cesiumjs.org/refdoc.html): If you know what you want to learn
	about, this is a helpful place to look.
* [CesiumJS Tutorials](http://cesiumjs.org/tutorials.html): This is a good place to start if you're
	new to CesiumJS.

#### Copyright
Copyright 2018 Regents of the University of Colorado. All rights reserved.

#### Terms of Use
Commercial use of this project is forbidden due to the terms set forth by Highstock.
