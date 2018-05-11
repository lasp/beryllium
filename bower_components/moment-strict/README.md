# Moment-Strict

This is an AngularJs service that wraps Moment.js and removes Moment's
ability to fall back to native Date parsing. Native Date parsing is
often problematic because different browsers handle various nonstandard
date strings differently. Here are a couple examples:

```javascript
// This nearly-correct ISO 8601 string does not include
// a timezone specifier (usually a trailing 'Z' to indicate
// 'Zulu' or the UTC timezone). Chrome will parse this
// 'successfully' and will assume the UTC timezone. Firefox
// will do the same but will assume the local timezone.
// Passing the same string to Moment.js will fall back to
// the native Date parsing, and so will be just as inconsistent
// as the browser is. Passing this string to Moment-Strict
// will result in a parsing error in all browsers.
new Date('2015-01-01T00:00:00');

// Ambiguous whether this is mm/dd/yyyy or dd/mm/yyyy since
// different regions of the world have different
// conventions (I think Europe typically uses dd/mm/yyyy while
// America uses mm/dd/yyyy). The same browser (e.g. Chrome)
// may behave differently in different locales around the world.
new Date('01/01/2015');
```

## Usage

1. Install via Bower:

	```
	bower install bower install https://github.com/lasp/moment-strict.git
	```

2. Include `bower_components/moment-strict/moment-strict.js` in your build
	* Although they are not listed as bower dependencies, you will also need angular and moment
	included on the page before moment-strict.js
3. Add a dependency to your angular app for 'moment-strict'
3. Wherever you would normally use `moment(dateStr)` or `moment.utc(dateStr)` instead use
	`momentStrict(dateStr)` or `momentStrict.utc(dateStr)`.
