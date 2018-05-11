# LASP Datepicker

### Contacts

* **Experienced Devs:**
    * Brian Putnam
    * Irfan Nadiadi
    * Tyler Traver
    * Ransom Christofferson

### General LASP Project Information

The LASP Datepicker does not have a product owner, but is managed by the LASP Web Application Development
team as it is a plugin for our AngularJS web apps. When existing third-party datepickers were found to
not satisfy stakeholder requirements, the team opted to develop a custom solution that would.


### LASP Datepicker Summary

The LASP Datepicker project includes four different AngularJS directives, written for Angular 1.x. It is
not compatible with Angular 2.x. Each directive is a standalone datepicker that can be instantiated in an
Angular application. LASP Datepicker is installed in a project as a bower component, and its files are
version controlled with the project.

* **&lt;datepicker-duration&gt;**
This directive provides functionality for a user to identify a date based on a specified duration from
a start or end time.
* **&lt;datepicker-year&gt;**
This directive allows a user to select start and end times formatted as year-only.
* **&lt;datepicker-date&gt;**
This directive provides an editable start and end time input field, each with a button for a popup calendar
widget. The input field is formatted as an ISO8601 date string (YYYY-MM-DD).
* **&lt;datepicker-minimal&gt;**
This is the full-featured datepicker directive. It provides an editable start and end time input field, date
format selector, and Local/UTC timezone toggle. Selecting an input field expands an advanced drop-down area
with features to set an absolute datetime for the start or end field, or set by duration from the alternate.  


### Relevant JIRA Project(s)

* Main project for WebTCAD codebase, the original application for the LASP Datepicker.
* Main project for the	Lisird3 codebase.

### Production URLs

This project does not have its own production URL as it is a plugin for other web applications,
namely WebTCAD and LISIRD.

### Architecture

Source components for LASP Datepicker are found in `src/`, and any development on the project should take place
within these components. The four datepicker directives are separated into their own directories, which each include
JavaScript and HTML files:

* ***.directive.js**: Controller for the datepicker directive
* ***.spec.js**: Unit tests for the datepicker directive
* ***.template.html**: HTML template for the directive.

```
├── datepicker-date
│   ├── datepicker-date.directive.js
│   ├── datepicker-date.spec.js
│   ├── datepicker-date.template.html
├── datepicker-duration
│   ├── datepicker-duration.directive.js
│   └── datepicker-duration.template.html
├── datepicker-minimal
│   ├── datepicker-minimal.directive.js
│   ├── datepicker-minimal.spec.js
│   ├── datepicker-minimal.template.html
├── datepicker-year
│   ├── datepicker-year.directive.js
│   ├── datepicker-year.spec.js
│   └── datepicker-year.template.html
```

In the same directory, we also maintain the services which the datepicker directives depend on.

```
├── datepicker-base
│   └── datepicker-base.service.js
├── moment-strict
│   ├── moment-strict.service.js
│   └── moment-strict.spec.js
└── time-utils
    ├── time-utils.service.js
    └── time-utils.spec.js
```

### Build System

The project uses the standard Gulp build system.



##### Task Cheatsheet

Common development tasks with LASP Datepicker will often only require the following commands:

* `gulp serve`: Deploys a test page listing all the datepicker directives. Development on LASP Datepicker
can be debugged and tested using this page.

* `gulp deployDemo`: Deploys the test page for the current branch on `ds-webapp-dev` in order to demo new
changes to the team.

* `gulp test`: Executes the unit tests written for the project.

### Running LASP Datepicker Locally

Clone the project and navigate to its root directory. Run `npm install` to install the node modules required
for development. `bower install` should not be necessary as `bower_components/` is version controlled.
Run `gulp serve` to locally deploy the test page for the project.

##### Project Dependencies

You'll need to have [NodeJS v5](https://nodejs.org/en/) (or greater) and [Gulp](http://gulpjs.com/) installed
locally (globally, or however you like to run them).

### Deploying LASP Datepicker

#### Process

##### Publish changes to LASP Datepicker

1. After checking out a new branch of the repository, make your changes to the source components locally.
2. If `gulp serve` was used to test changes, then the `/dist` folder was automatically updated. Otherwise,
run `gulp build` to copy the new changes to `/dist`.
3. Commit changes to the source components, as well as to the `/dist` folder.
4. Create a pull request to merge the new branch back to master.
5. After merging to master, it is good practice to run `gulp build` again (on master) and commit the changes.
Built files occasionally do not merge well. Additionally, if there are any merge conflicts in the `/dist` folder,
the solution is to run `gulp build` again and commit the new files.

##### Import LASP Datepicker into dependent project

1. To import LASP Datepicker into a project, it is managed as a bower component. For an initial install, update
the `bower.json` file in the dependent project to include the URL to the LASP Datepicker git repository, tagged
with the latest commit hash. Run `bower update lasp-datepicker` to install the plugin.
2. If LASP Datepicker is already installed in the dependent project, update the commit hash for LASP Datepicker
to point to the most recent or desired commit and run `bower update lasp-datepicker` to download the most recent
changes.
3. Commit the new changes to the bower component, as this is version controlled in dependent projects.

##### Using LASP Datepicker in a dependent project
When LASP Datepicker is installed in another project as a bower component, the files `dist/lasp-datepicker.js`
and `dist/lasp-datepicker.css` must be linked as dependencies. In some applications, this may be configured
through gulp. Otherwise, it can be included in the `index.html` file for the application. Once this is complete,
any of the four datepickers can be instantiated in templates within the Angular application.

For example, to instantiate the `<datepicker-minimal>` directive, the following HTML code needs to be added to
your template. For examples of other datepicker directives, see the LASP Datepicker test page.

```html
<datepicker-minimal
    date="date"
    config="datePickerConfig">
</datepicker-minimal>
```

In your associated controller, include the following JavaScript code:

```javascript
$scope.date = {
    start: new Date('2016-01-01'),
    end: new Date()
};

$scope.datePickerConfig = {
    type: "datetime_minimal",
    timeFormat: "YYYY-DDDD"
};
```

### FAQs and Help

##### LASP Datepicker-specific common issues & gotchas

###### Changes made outside Gulp
If `gulp serve` was run to test changes to the project, then the `dist/` folder will automatically be
updated with the newly built files. If not, then `gulp build` needs to be run manually before changes are
committed back to Stash so that the new dist files are also included.

###### Time formatting
We use Moment.JS to format times, and currently the two desired formats are YYYY-MM-DD (standard) and
YYYY-DDD (ordinal). These are both ISO 8601 date strings. It should be noted that to conform to ISO
8601 for the ordinal date format, the day-of-year must be represented as three digits (_e.g. 2016-078
not 2016-78_). To achieve this using Moment.JS, the format is specified as "YYYY-DDDD". Including only
three D's in the format would not enforce the three digit requirement.


### External Resources

* [Moment.js](http://momentjs.com/)
* [Angular Bootstrap](https://angular-ui.github.io/bootstrap/)
