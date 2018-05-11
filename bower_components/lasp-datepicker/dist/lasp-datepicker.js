
(function() {

'use strict'

angular.module( 'laspDatePicker', [] );

})();

(function() {

'use strict'

function DatepickerBase(scope, elem) {

    this.scope = scope;
    this.elem = elem;

    scope.model = {
        validationError: undefined,

        startDateStyle: this.STYLE_VALID,
        endDateStyle: this.STYLE_VALID,
    }
}

// Everything in this constants object will
// be copied to both the DatepickerBase and
// its prototype, so that they're available
// both statically and as a part of the
// instances.
var constants = {
    "STYLE_VALID": {
        'background-color': '#fff'
    },
    "STYLE_INVALID": {
        'background-color': '#fee'
    },

    ISO_STANDARD_FORMAT: 'YYYY-MM-DD',
    ISO_ORDINAL_FORMAT: 'YYYY-DDDD',

    TIMEZONES: [ 'utc', 'local' ]
};

constants.TIME_FORMATS = [
    constants.ISO_STANDARD_FORMAT,
    constants.ISO_ORDINAL_FORMAT
];

Object.keys(constants).forEach(function( key ) {
    DatepickerBase[key] = DatepickerBase.prototype[key] = constants[key];
});

DatepickerBase.prototype.resetValidation = function() {
    this.scope.model.validationError = undefined;
    this.scope.model.startDateStyle = this.STYLE_VALID;
    this.scope.model.endDateStyle = this.STYLE_VALID;
};

var dateFnsToWrap = [
    "getUTCDate",
    "getUTCDay",
    "getUTCFullYear",
    "getUTCHours",
    "getUTCMilliseconds",
    "getUTCMinutes",
    "getUTCMonth",
    "getUTCSeconds",
    "setUTCDate",
    "setUTCFullYear",
    "setUTCHours",
    "setUTCMilliseconds",
    "setUTCMinutes",
    "setUTCMonth",
    "setUTCSeconds",
    "toUTCString"
];

// The JS Date object provides several pairs of utc/local functions,
// with a naming convention like "getFullYear" and "getUTCFullYear".
// Here, we populate DatepickerBase.prototype with dynamic 'switcher'
// functions that will automatically choose the right function from
// the pair based on the value of this.scope.timezone. Each 'switcher'
// function takes a JS Date as the first argument, and will pass on
// and remaining arguments after the 1st to whichever underlying
// function it eventually calls.
//
// So, for example, calling
// myDatepickerBase.setDate( myJsDate, 3 )
// is equivalent to
// myJsDate.setDate( 3 )
// if
// myDatepickerBase.scope.timezone === 'local'
// and is equivalent to
// myJsDate.setUTCDate(3)
// if
// myDatepickerBase.scope.timezone === 'utc'
dateFnsToWrap.forEach(function(utcFnName) {
    var localFnName = utcFnName.replace('UTC', '');

    var utcFn = Date.prototype[utcFnName];
    var localFn = Date.prototype[localFnName];

    DatepickerBase.prototype[localFnName] = function( date ) {
        var remainingArgs = Array.prototype.slice.call(arguments, 1); // all arguments to this function except the 1st
        var fnToCall = this.scope.timezone === 'utc' ? utcFn : localFn;
        return fnToCall.apply(date, remainingArgs);
    };
})

angular.module( 'laspDatePicker' ).service( 'datepickerBase', [ function() { return DatepickerBase; } ]);

})();

(function() {

'use strict';

var MILLISECONDS_PER_MINUTE = 60 * 1000;

angular.module( 'laspDatePicker' ).service(
    'timeUtils',
    [
        function() {
            return {

                /**
                * @ngdoc method
                * @name localToUtc
                * @methodOf dateRange
                * @description 
                * Adds the offset from Local time to UTC time 
                */
                localToUtc: function( date ) {
                    return new Date ( date.getTime() + date.getTimezoneOffset() * MILLISECONDS_PER_MINUTE );
                },

                /**
                * @ngdoc method
                * @name utcToLocal
                * @methodOf dateRange
                * @description 
                * Subtracts the offset from Local time to UTC time
                */
                utcToLocal: function( date ) {
                    return new Date ( date.getTime() - date.getTimezoneOffset() * MILLISECONDS_PER_MINUTE );                
                }
            }
        }
    ]
)

})();

(function() {
'use strict';

// Replace moment.createFromInputFallback with this function
// to disable falling back to the native Date object for
// parsing. Beware: that change is global and will affect
// all users of the moment function.
function disableNativeDateFallback(config) {
    config._d = new Date(parseFloat('NaN')); // an invalid date
}

angular.module( 'laspDatePicker' ).service(
    'momentStrict',
    [
        function() {

            var makeMomentWrapper = function(momentFn) {
                return function() {
                    var prevFallback = moment.createFromInputFallback;
                    moment.createFromInputFallback = disableNativeDateFallback;
                    var result = momentFn.apply(null, arguments);
                    moment.createFromInputFallback = prevFallback;
                    return result;
                }
            };

            var momentWrapper = makeMomentWrapper(moment);
            momentWrapper.utc = makeMomentWrapper(moment.utc);
            return momentWrapper;
        }
    ]
);

})();

(function() {

function durationDirectiveFn() {
    return {
        restrict: 'E',
        templateUrl: 'datepicker-duration/datepicker-duration.template.html',
        scope: {
            label: '@',
            relativeTo: '@',
            relativeSymbol: '@',
            onNumberChange: '=',
            onMultiplierChange: '=',
            style: '=',
            model: '='
        },
        link: function(scope, element) {
            
        }
    };
}

angular.module( 'laspDatePicker').directive('datepickerDuration', durationDirectiveFn);

})();

(function() {

var dependencies = [
    'datepickerBase',
    'momentStrict'
];

function datepickerDirectiveFn(DatepickerBase, momentStrict) {
    return {
        restrict: 'E',
        templateUrl: 'datepicker-date/datepicker-date.template.html',
        scope: {
            config: '=',
            date: '=',
            onPopupOpen: '&',
            onPopupClose: '&',
            onError: '&'
        },
        link: function(scope, element) {
            var datepickerBase = new DatepickerBase(scope, element);

            if( typeof scope.config.timezone === 'undefined' ) {
                throw 'You must pass scope.config.timezone to <datepicker-date>. This tells the directive how to interpret the JS Date objects in `scope.date` that you provide.'
            }
            else if ( datepickerBase.TIMEZONES.indexOf(scope.config.timezone) === -1 ) {
                throw 'Unrecognized value for scope.config.timezone: "' + scope.config.timezone + '"';
            }

            scope.config.timeFormat = (DatepickerBase.TIME_FORMATS.indexOf(scope.config.timeFormat) === -1)
                ? DatepickerBase.ISO_STANDARD_FORMAT
                : scope.config.timeFormat;

            angular.extend(
                scope,
                {
                    // This is *the* authoritative model for our
                    // datepicker. The proverbial buck stops here.
                    // When other information disagrees with the
                    // authoritative information, the authoritative
                    // information wins.
                    //
                    // This pair of objects intentionally does not
                    // contain time or timezone information, because
                    // that is more specificity than our interface
                    // presents to the user.
                    //
                    // By its nature this object has 'day' precision.
                    // A JS Date object has 'millisecond' precision.
                    // Therefore, in order to create a JS Date object
                    // from the authoritative object, you will have
                    // to find or invent some extra information.
                    // The onus is on you to do that conversion
                    // in a way that makes sense.
                    authoritative: {
                        start: {
                            year: -1,
                            month: -1,
                            day: -1
                        },
                        end: {
                            year: -1,
                            month: -1,
                            day: -1
                        }
                    },

                    // This object contains other objects that are
                    // calculated from the authoritative object.
                    // When extra information must be invented for
                    // the calculation (e.g. for creating JS Date
                    // objects) we must be explicit about how we
                    // do that.
                    calculated: {

                        // string created according to scope.config.timeFormat
                        str: {
                            start: '',
                            end: ''
                        },

                        // JS Date created by interpreting authoritative
                        // as midnight, utc.
                        jsDateMidnightUtc: {
                            start: null,
                            end: null
                        },

                        // JS Date created by interpreting authoritative
                        // as midnight local time. It is important to note that
                        // this refers to a different millisecond than
                        // jsDateMidnightUtc and is not simply a
                        // different representation of the same time.
                        jsDateMidnightLocal: {
                            start: null,
                            end: null
                        }
                    },

                    model: {
                        dateOpenedStart: false,
                        dateOpenedEnd: false
                    }
                }
            );

            // http://stackoverflow.com/questions/1353684/detecting-an-invalid-date-date-instance-in-javascript
            var isValidDate = function(d) {
                return Object.prototype.toString.call(d) === "[object Date]" && !isNaN(d.getTime());
            };

            var capitalize = function(word) {
                return word.charAt(0).toUpperCase() + word.slice(1);
            };

            // return true if scope.authoritative.start is strictly
            // before scope.authoritative.end, else false.
            var startIsBeforeEnd = function() {
                var start = scope.authoritative.start;
                var end = scope.authoritative.end;

                if( start.year < end.year ) { return true; }
                if( start.year > end.year ) { return false; }

                // years are equal, now test months
                if( start.month < end.month ) { return true; }
                if( start.month > end.month ) { return false; }

                // years and months are equal, now test days
                if( start.day < end.day ) { return true; }
                if( start.day > end.day ) { return false; }

                // year, month, and day are all equal
                // return false because start is not strictly less than end
                return false;
            };

            // Remove all validation error messages and styles
            var resetValidation = function() {
                scope.model.validationError = null;
                scope.onError({ error: null });
                scope.model.startDateStyle = datepickerBase.STYLE_VALID;
                scope.model.endDateStyle = datepickerBase.STYLE_VALID;
            };

            // Set the error message and apply STYLE_INVALID to
            // the appropriate input specified by `which`
            // ('start', 'end' or 'both')
            var setValidationError = function(which, errMsg) {
                if( !scope.model.validationError ) {
                    scope.model.validationError = errMsg;
                    scope.onError({ error: scope.model.validationError });

                    if( which === 'start' || which === 'both' ) {
                        scope.model.startDateStyle = datepickerBase.STYLE_INVALID;
                    }
                    if( which === 'end' || which === 'both') {
                        scope.model.endDateStyle = datepickerBase.STYLE_INVALID;
                    }
                }
            };

            // Miscellaneous global-ish validation checks. Since most
            // parsing errors should be handled in our onChange handlers,
            // there isn't a ton to put here.
            var performValidationChecks = function() {
                if( !startIsBeforeEnd() ) {
                    setValidationError('both', 'Please enter a start time that falls before the end time');
                }
            };

            var toggleModelVariable = function($event, key) {
                $event.preventDefault();
                $event.stopPropagation();
                scope.model[key] = !scope.model[key];
            };
            scope.toggleStartPicker = function( $event ) { toggleModelVariable( $event, 'dateOpenedStart' ); };
            scope.toggleEndPicker = function( $event ) { toggleModelVariable( $event, 'dateOpenedEnd' ); };

            // Trigger the onPopupOpen/onPopupClose events.
            // 
            // I tried doing this from inside toggleStartPicker
            // and toggleEndPicker, but that doesn't react to
            // events where the user closes the datepicker by
            // clicking on some random whitespace around the
            // page (it will react correctly if you close the
            // datepicker by clicking directly on the calendar
            // button). Using a $watch statement was the only
            // way I could figure out to catch all open/close
            // events correctly.
            var watchDateOpenedVar = function(varName, which) {
                scope.$watch(varName, function(newVal, oldVal) {
                    if( newVal === oldVal ) { return; }
                    if( newVal ) { scope.onPopupOpen({ which: which }); }
                    else { scope.onPopupClose({ which: which }); }
                });
            }
            watchDateOpenedVar('model.dateOpenedStart', 'start');
            watchDateOpenedVar('model.dateOpenedEnd', 'end');

            // When the authoritative values change, update
            // all of the calculated values, and the
            // parent values.
            var onAuthoritativeChanged = function(which) {
                if( typeof which === 'undefined' ) {
                    onAuthoritativeChanged('start');
                    onAuthoritativeChanged('end');
                    return;
                }

                var authoritativeDate = scope.authoritative[which];

                // update scope.calculated.str
                scope.calculated.str[which] = momentStrict(scope.authoritative[which]).format(scope.config.timeFormat);

                // update scope.calculated.jsDateMidnightUtc
                var milliseconds = Date.UTC(
                    authoritativeDate.year,
                    authoritativeDate.month,
                    authoritativeDate.day
                );
                scope.calculated.jsDateMidnightUtc[which] = new Date(milliseconds);

                // update scope.calculated.jsDateMidnightLocal
                scope.calculated.jsDateMidnightLocal[which] = new Date(
                    authoritativeDate.year,
                    authoritativeDate.month,
                    authoritativeDate.day
                );

                // update parent date. Don't overwrite any time information
                // the parent may have left there.
                var parentDate = scope.date[which];
                if( scope.config.timezone === 'utc' ) {
                    parentDate.setUTCFullYear(authoritativeDate.year);
                    parentDate.setUTCMonth(authoritativeDate.month);
                    parentDate.setUTCDate(authoritativeDate.day);
                }
                else {
                    parentDate.setFullYear(authoritativeDate.year);
                    parentDate.setMonth(authoritativeDate.month);
                    parentDate.setDate(authoritativeDate.day);
                }
            };

            // When calculated.str changes, propagate the change
            // to the authoritative values.
            scope.onCalculatedStrChanged = function() {
                resetValidation();

                ['start','end'].forEach( function(which) {
                    var newStrVal = scope.calculated.str[which];

                    // Note: we can interpret newStrVal in any timezone
                    // we want, as long as we get the year/month/day
                    // values from the same timezone.
                    var momentLocal = moment(newStrVal, scope.config.timeFormat, true); // force strict parsing
                    if( momentLocal.isValid() ) {
                        scope.authoritative[which] = {
                            year: momentLocal.year(),
                            month: momentLocal.month(),
                            day: momentLocal.date()
                        };
                        onAuthoritativeChanged(which);
                    }
                    else {
                        var errMsg = capitalize(which) + ' time must follow the format "' + scope.config.timeFormat + '"';
                        setValidationError(which, errMsg);
                    }
                });

                performValidationChecks();
            };

            // When calculated.jsDateMidnightUtc changes, update the
            // authoritative values.
            var onCalculatedJsDateMidnightUtcChanged = function(which) {
                var newDate = scope.calculated.jsDateMidnightUtc[which];

                if( isValidDate(newDate) ) {
                    scope.authoritative[which] = {
                        year: newDate.getUTCFullYear(),
                        month: newDate.getUTCMonth(),
                        day: newDate.getUTCDate()
                    };
                    onAuthoritativeChanged(which);
                }
                else {
                    // The above should always be true: if not someone
                    // has a bug in their code (but it might not be us)
                    throw 'Error: scope.calculated.jsDateMidnightUtc was not a valid Date';
                }
            };
            scope.onCalculatedJsDateMidnightUtcStartChanged = function() {
                resetValidation();
                onCalculatedJsDateMidnightUtcChanged('start');
                performValidationChecks();
            };
            scope.onCalculatedJsDateMidnightUtcEndChanged = function() {
                resetValidation();
                onCalculatedJsDateMidnightUtcChanged('end');
                performValidationChecks();
            };

            // When calculated.jsDateMidnightLocal changes, update the
            // authoritative values.
            var onCalculatedJsDateMidnightLocalChanged = function(which) {
                var newDate = scope.calculated.jsDateMidnightLocal[which];

                if( isValidDate(newDate) ) {
                    scope.authoritative[which] = {
                        year: newDate.getFullYear(),
                        month: newDate.getMonth(),
                        day: newDate.getDate()
                    };
                    onAuthoritativeChanged(which);
                }
                else {
                    // The above should always be true: if not someone
                    // has a bug in their code (but it might not be us)
                    throw 'Error: scope.calculated.jsDateMidnightUtc was not a valid Date';
                }
            };
            scope.onCalculatedJsDateMidnightLocalStartChanged = function() {
                resetValidation();
                onCalculatedJsDateMidnightLocalChanged('start');
                performValidationChecks();
            };
            scope.onCalculatedJsDateMidnightLocalEndChanged = function() {
                resetValidation();
                onCalculatedJsDateMidnightLocalChanged('end');
                performValidationChecks();
            };

            // When the parent scope changes `scope.date`,
            // propagate the change to the authoritative
            // values.
            var onParentDateChanged = function(which) {
                if( typeof which === 'undefined' ) {
                    onParentDateChanged('start');
                    onParentDateChanged('end');
                    return;
                }

                var parentDate = scope.date[which];
                if( !isValidDate(parentDate) ) {
                    setValidationError(which, 'Error: Invalid Date passed for `scope.date.' + which + '` (' + parentDate + ')');
                }

                if( scope.config.timezone === 'local' ) {
                    scope.authoritative[which] = {
                        year: parentDate.getFullYear(),
                        month: parentDate.getMonth(),
                        day: parentDate.getDate()
                    }
                }
                else {
                    // timezone === 'utc'
                    scope.authoritative[which] = {
                        year: parentDate.getUTCFullYear(),
                        month: parentDate.getUTCMonth(),
                        day: parentDate.getUTCDate()
                    }
                }

                onAuthoritativeChanged(which);
            };
            scope.$watch('date', function() {
                if( scope.date.updateFromParent === true ) {
                    scope.date.updateFromParent = false;

                    resetValidation();
                    onParentDateChanged();
                    performValidationChecks();
                }
            }, true);

            // Not really putting these on the scope for a good
            // reason, just so that I can call them from the
            // unit tests.
            scope.testing = {
                onParentDateChanged: onParentDateChanged,
                // onCalculatedStrChanged: onCalculatedStrChanged,
                // onCalculatedJsDateMidnightUtcChanged: onCalculatedJsDateMidnightUtcChanged,
                // onCalculatedJsDateMidnightLocalChanged: onCalculatedJsDateMidnightLocalChanged
            };

            // Our starting values from the parent scope
            // are expected to live in `scope.date`. Calling
            // onParentDateChanged() will propagate both
            // values to all other values in our scope/model.
            onParentDateChanged();
            performValidationChecks();
        }
    };
}

var annotatedDirective = [].concat(dependencies);
annotatedDirective.push(datepickerDirectiveFn);

angular.module( 'laspDatePicker').directive('datepickerDate', annotatedDirective);

})();

(function() {

angular.module( 'laspDatePicker' ).directive(
    'dateInput',
    [
        function( ) {
            return {
                restrict: "E",
                templateUrl: 'datepicker-minimal/date-input.template.html',
                scope: {
                    title: "@",
                    model: "=",
                    style: "=",
                    onFocus: "&",
                    onChange: "&"
                }
            }
        }
    ]
);

})();


(function() {

var dependencies = [
    'datepickerBase',
    'timeUtils',
    'momentStrict',
    '$document'
];

function datepickerDirectiveFn(DatepickerBase, timeUtils, momentStrict, $document) {
    return {
        restrict: 'E',
        templateUrl: 'datepicker-minimal/datepicker-minimal.template.html',
        scope: {
            config: '=',
            date: '='
        },
        link: function(scope, element) {
            var MILLISECONDS_PER_MINUTE = 60 * 1000;

            var datepickerBase = new DatepickerBase(scope, element);
            
            angular.extend(
                scope.model,
                {
                    durationMultiplier: String( 60 * MILLISECONDS_PER_MINUTE ), // Milliseconds in an hour, defaulting the duration to 'hours'
                    duration: 0
                }
            );

            scope.init = function() {
                scope.changeTimeZone();
                scope.getDuration();
            };

            /**
            * @ngdoc method
            * @name changeTimeZone
            * @methodOf dateRange
            * @description 
            * Changes the displayed time to either be local or utc. This function assumes the original time format was in UTC.
            * The date picker module from bootstrap will display time in local time. In order to display UTC we need to trick it by
            * adding the timezone offset to the original utc date. This needs to be removed before we send the request to LaTiS
            */
            scope.changeTimeZone = function() {
                var date = angular.copy( scope.date );
                if ( scope.config.timezone === 'local' ) {
                    date.start = timeUtils.utcToLocal( date.start );
                    date.end = timeUtils.utcToLocal( date.end );
                }
                setAllDates( date.start, date.end );
            };

            /**
            *
            * @ngdoc method
            * @name getDuration
            * @methodOf dateRange
            * @description 
            * Sets the displayed duration based on the start and end times
            */
            scope.getDuration = function() {
                // scope.durationMultiplier determines whether to format the duration in days, hours, minutes or seconds.
                // It represents milliseconds per unit.
                if ( typeof scope.date.start !== 'undefined' && typeof scope.date.end !== 'undefined' ) {
                    scope.model.duration = parseFloat((( scope.date.end.getTime() - scope.date.start.getTime() ) / Number(scope.model.durationMultiplier)).toFixed( 2 ));
                }
            };
            
            /**
            *
            * @ngdoc method
            * @name validateInput
            * @methodOf dateRange
            * @description 
            * Check that input text matches necessary criteria
            */
            scope.validateInput = function() {

                var momentDates = getMomentDates();
                // First, check that user editable dates are valid
                var mainStart = momentDates.start;
                var mainEnd = momentDates.end;
                var inputStart = momentDates.inputStart;
                var inputEnd = momentDates.inputEnd;
                var tabStart = momentDates.tabStart;
                var tabEnd = momentDates.tabEnd;
                var timepickerStart = momentDates.timepickerStart;
                var timepickerEnd = momentDates.timepickerEnd;
                
                var allStartsValid =
                    tabStart.isValid() &&
                    inputStart.isValid() &&
                    timepickerStart.isValid();

                var allEndsValid =
                    tabEnd.isValid() &&
                    inputEnd.isValid() &&
                    timepickerEnd.isValid();

                var allTimesValid = allStartsValid && allEndsValid;

                var durationIsNumber = typeof scope.model.duration === 'number';

                var endIsAfterStart = 
                    allTimesValid && // short-circuit to prevent calls to validOf from throwing
                    tabEnd.valueOf() > tabStart.valueOf() &&
                    mainEnd.valueOf() > mainStart.valueOf();

                var allValid = allTimesValid && endIsAfterStart && durationIsNumber;

                resetValidation();

                // First, check that all inputs are valid date formats
                if ( allValid ) {
                    return;
                }
                // If we get past the first if-statement something was invalid.
                // If any of the dates were invalid, print an appropriate error message with the proper formatting
                else if ( !allTimesValid ) {
                    var startEndTimeStr = !allStartsValid ? 'Start time' : 'End time';
                    scope.model.validationError = startEndTimeStr + ' must follow the format "' + scope.config.timeFormat + '"';
                    scope.disableReplot = true;

                    if (!allStartsValid) {
                        scope.model.startDateStyle = DatepickerBase.STYLE_INVALID;
                    }

                    if (!allEndsValid) {
                        scope.model.endDateStyle = DatepickerBase.STYLE_INVALID;
                    }
                    return;
                }
                // First check if the start & end dates are in order
                else if ( !endIsAfterStart ) {
                    scope.model.validationError = 'Please enter a start time that falls before the end time';
                    scope.disableReplot = true; // Disable the 'Apply' button
                    scope.model.startDateStyle = DatepickerBase.STYLE_INVALID;
                    scope.model.endDateStyle = DatepickerBase.STYLE_INVALID;
                    return;
                }
                // If the start and end date fields are valid, then a non-numeric character may have been entered in the duration field
                else if ( !durationIsNumber ) {
                    scope.model.validationError = 'Duration must be a number';
                    scope.disableReplot = true;
                    scope.model.durationStyle = DatepickerBase.STYLE_INVALID;
                    return;
                } else {
                    throw "Programming error: some failure case is not tested for";
                }
            };
            
            /**
            *
            * @ngdoc method
            * @name resetValidation
            * @methodOf dateRange
            * @description 
            * Reset error message, input field styles, and enable plot button
            */
            var resetValidation = function() {
                datepickerBase.resetValidation();
                scope.disableReplot = false;
                scope.model.durationStyle = DatepickerBase.STYLE_VALID;
            };
            
            /**
            *
            * @ngdoc method
            * @name updateTimeFormat
            * @methodOf dateRange
            * @description
            * Calls the methods to update the tabDate and inputDate. scope.config.timeFormat is a scope variable,
            * so simply calling setTabDate and setInputDate with the current date will automatically update those dates
            * with the selected time format.
            */
            scope.updateTimeFormat = function() {
                var date = scope.model.tabDate;
                setTabDate( date.start, date.end );
                setInputDate( date.start, date.end );
                scope.validateInput();
            };

            /**
            *
            * @ngdoc method
            * @name updateTimeEnd
            * @methodOf dateRange
            * @description 
            * Updates the end time based on the start time and selected duration
            */
            scope.updateTimeEnd = function() {
                var date = {
                        start : scope.date.start,
                        end : new Date( scope.date.start.getTime() + (scope.model.duration * Number(scope.model.durationMultiplier)) )
                };
                // When local time is selected, scope.date remains as UTC but the rest of the model needs to be offset
                if ( scope.config.timezone === 'local' ) {
                    date.start = timeUtils.utcToLocal( date.start );
                    date.end = timeUtils.utcToLocal( date.end );
                }
                setAllDates( date.start, date.end );
                scope.validateInput();
            };

            /**
            *
            * @ngdoc method
            * @name updateTimeStart
            * @methodOf dateRange
            * @description 
            * Updates the start time based on the end time and selected duration
            */
            scope.updateTimeStart = function() {
                var date = {
                        start : new Date( scope.date.end.getTime() - (scope.model.duration * Number(scope.model.durationMultiplier)) ),
                        end : scope.date.end
                }
                if ( scope.config.timezone === 'local' ) {
                    date.start = timeUtils.utcToLocal( date.start );
                    date.end = timeUtils.utcToLocal( date.end );
                }
                setAllDates( date.start, date.end );
                scope.validateInput();
            };
                        
            // Functions to open and close the datepickers
            scope.toggleStartPicker = function( $event ) {
                $event.preventDefault();
                $event.stopPropagation();
                scope.model.dateOpenedStart = !scope.model.dateOpenedStart;
            };
            
            scope.toggleEndPicker = function( $event ) {
                $event.preventDefault();
                $event.stopPropagation();
                scope.model.dateOpenedEnd = !scope.model.dateOpenedEnd;
            };
            
            // Functions to open and close advanced start and end settings
            scope.openAdvancedStart = function() {
                scope.model.showAdvancedStart = true;
                scope.model.showAdvancedEnd = false;
            };
            
            scope.openAdvancedEnd = function() {
                scope.model.showAdvancedStart = false;
                scope.model.showAdvancedEnd = true;
            };
            
            scope.closeAdvancedSettings = function() {
                scope.model.showAdvancedStart = false;
                scope.model.showAdvancedEnd = false;
            };
            
            // This watcher is only used to update the model when scope.date is changed outside of the datepicker directive
            scope.$watch('date', function() {
                // When scope.date is updated outside of the datepicker, we need to explicity set the flag scope.date.updateFromParent.
                // This way we won't catch extraneous changes to scope.date
                if ( scope.date.updateFromParent && scope.date.updateFromParent === true ) {
                    scope.date.updateFromParent = false;
                    var date = scope.date;
                    scope.config.timezone = 'utc';
                    setAllDates( date.start, date.end );

                    // Update duration and validationError values
                    scope.getDuration();
                    scope.validateInput();
                }
            }, true);
            
            // In order to check whether the user clicked in the datepicker or outside of it, 
            // we need to get the parent elements of the relatedTarget (the element that was clicked).
            // If one of the parent elements contains the datepicker, then we know we should not close the settings.
            // Given an element, this will return all parents/grandparents/etc as an array of HtmlElement
            var getParents = function(el) {
                var result = [];
                if (el) {
                    var currentParent = el.parentElement;
                    while (currentParent) {
                        result.push(currentParent);
                        currentParent = currentParent.parentElement;
                    }
                }
                return result;
            }
            
            // Since we've refactored each datepicker style to be its own directive,
            // we know that the element we want will simply be the first child of our
            // <datepicker-minimal> element (there may also be some other elements afterwards).
            // There used to be much more complicated logic here.
            var allDatepickerElements = element.children();
            var datepickerElement = allDatepickerElements[0];

            // This code is our solution to closing the advanced settings box for the datepicker_minimal view
            // when the datepicker loses focus. We originally tried using Angular's ngBlur directive to catch when 
            // the advanced settings would lose focus. This sort of worked, but because there are so many different elements 
            // in the advanced settings box, clicking certain elements or the white space within the box would 
            // trigger a blur event and close the box.
            if ( datepickerElement !== null && typeof datepickerElement !== 'undefined' ) {
                // This solution involves listening for a blur event in the datepicker.
                datepickerElement.addEventListener('blur', function( e ) {
                    // First, we check where the user clicked. For a blur event, the relatedTarget is the element receiving focus.
                    // Note, blur events in Firefox do not support relatedTarget, so we include _.explicitOriginalTarget as a workaround
                    var relatedTarget = e.relatedTarget ||          // for proper browsers
                                        e.explicitOriginalTarget || // for firefox
                                        document.activeElement;     // for IE 9-11
                    
                    // If the relatedTarget is null or is document.body, the user did not click in the datepicker and we should close
                    var hasActiveElement = !(relatedTarget == null || relatedTarget == document.body);
                    
                    // If hasActiveElement is true, the body was not clicked. Check the parent elements of 
                    // the element that was clicked, and see if they contain the datepicker. If indexOf returns > -1,
                    // one of the parent elements contains the datepicker and we should not close the settings.
                    var activeElementIsChild = hasActiveElement && getParents(relatedTarget).indexOf(this) > -1;
                    if ( !hasActiveElement || !activeElementIsChild ) {
                        // wait for mouseup or keyup to close the advanced settings panel
                        $document.on( 'mouseup', closeOnce );
                        $document.on( 'keyup', closeOnce );
                    } else {
                        return;
                    }
                }, true);
            }
            
            function closeOnce() {
                scope.closeAdvancedSettings();
                scope.$apply();
                $document.off( 'mouseup', closeOnce );
                $document.off( 'keyup', closeOnce );
            }
            
            scope.model.validationError = undefined;
            scope.model.startDateStyle = DatepickerBase.STYLE_VALID;
            scope.model.endDateStyle = DatepickerBase.STYLE_VALID;
            scope.model.showAdvancedStart = false;
            scope.model.showAdvancedEnd = false;
            
            // Maintain time format strings here. Note that the ordinal format has 4 D's as this is required in the format for moment.js 
            var isoStandardFormat = 'YYYY-MM-DD';
            var isoOrdinalFormat = 'YYYY-DDDD';
            
            /* Default time format is passed as 'YYYY-MM-DD' or 'YYYY-DDDD' when instantiating directive.
             * Double check that format is one of the two values that we'd expect, or use the ISO standard
             * format.
             */
            scope.config.timeFormat = (DatepickerBase.TIME_FORMATS.indexOf(scope.config.timeFormat) === -1)
                ? DatepickerBase.ISO_STANDARD_FORMAT
                : scope.config.timeFormat;
            scope.config.timezone = ( scope.config.timezone === 'utc' || scope.config.timezone === 'local') ? 
                                        scope.config.timezone : 'utc';
            
            scope.model.inputDate = {};
            scope.model.tabDate = {};
            scope.model.timepicker = {};
            
            /**
            * @ngdoc method
            * @name getMomentDates
            * @methodOf dateRange
            * @description 
            * Return Moment.JS date objects
            */
            var getMomentDates = function() {
                return {
                  start: momentStrict( scope.date.start ),
                  end: momentStrict( scope.date.end ),
                  inputStart: momentStrict( scope.model.inputDate.start ),
                  inputEnd: momentStrict( scope.model.inputDate.end ),
                  tabStart: momentStrict( scope.model.tabDate.start ),
                  tabEnd: momentStrict( scope.model.tabDate.end ),
                  timepickerStart: momentStrict( scope.model.timepicker.start ),
                  timepickerEnd: momentStrict( scope.model.timepicker.end )
                };
            };
            
            /**
            * @ngdoc method
            * @name setMainDate
            * @methodOf dateRange
            * @description 
            * Method to set the primary date object, scope.date. If local time is selected,
            * this method will also offset scope.date so that it always remains in UTC time.
            * @param {object} start Native JS Date object, Moment.JS date object, or ISO 8601 string to set as new start date
            * @param {object} end Native JS Date object, Moment.JS date object, or ISO 8601 string to set as new end date
            */
            var setMainDate = function( start, end ) {
                scope.date.start = momentStrict.utc( start ).toDate();
                scope.date.end = momentStrict.utc( end ).toDate();
                if ( scope.config.timezone === 'local' ) {
                    scope.date.start = timeUtils.localToUtc( scope.date.start );
                    scope.date.end = timeUtils.localToUtc( scope.date.end );
                }
            };

            /**
            * @ngdoc method
            * @name setTabDate
            * @methodOf dateRange
            * @description 
            * Method to set the date object which displays the full ISO 8601 string in the datepicker.
            * @param {object} start Native JS Date object, Moment.JS date object, or ISO 8601 string to set as new start date
            * @param {object} end Native JS Date object, Moment.JS date object, or ISO 8601 string to set as new end date
            */
            var setTabDate = function( start, end ) {
                scope.model.tabDate.start = momentStrict.utc( start ).format( scope.config.timeFormat + 'THH:mm:ss' );
                scope.model.tabDate.end = momentStrict.utc( end ).format( scope.config.timeFormat + 'THH:mm:ss' );
            };
            
            /**
            * @ngdoc method
            * @name setInputDate
            * @methodOf dateRange
            * @description 
            * Method to set the date object which displays the truncated ISO 8601 string, showing only the date, not time.
            * @param {object} start Native JS Date object, Moment.JS date object, or ISO 8601 string to set as new start date
            * @param {object} end Native JS Date object, Moment.JS date object, or ISO 8601 string to set as new end date
            */
            var setInputDate = function( start, end ) {
                scope.model.inputDate.start = momentStrict.utc( start ).format( scope.config.timeFormat );
                scope.model.inputDate.end = momentStrict.utc( end ).format( scope.config.timeFormat );
            };
            
            /**
            * @ngdoc method
            * @name setTimepickerDate
            * @methodOf dateRange
            * @description 
            * Method to set the date object used by the Bootstrap timepicker. Even if the timepicker is
            * passed a UTC date, it always defaults to displaying local time. As a result, in this method
            * we always have to offset the timepicker so it will display the desired date.
            * @param {object} start Native JS Date object, Moment.JS date object, or ISO 8601 string to set as new start date
            * @param {object} end Native JS Date object, Moment.JS date object, or ISO 8601 string to set as new end date
            */
            var setTimepickerDate = function( start, end ) {
                // In case these aren't passed as native date objects, which is required to calculate the offset
                var start = momentStrict.utc( start ).toDate();
                var end = momentStrict.utc( end ).toDate();
                scope.model.timepicker.start = timeUtils.localToUtc( start );
                scope.model.timepicker.end = timeUtils.localToUtc( end );
            };
            
            /**
            * @ngdoc method
            * @name setAllDates
            * @methodOf dateRange
            * @description 
            * Method to call all setter methods for the date model
            * @param {object} start Native JS Date object, Moment.JS date object, or ISO 8601 string to set as new start date
            * @param {object} end Native JS Date object, Moment.JS date object, or ISO 8601 string to set as new end date
            */
            var setAllDates = function( start, end ) {
                if ( momentStrict( start ).isValid() && momentStrict( end ).isValid() ) {
                    setMainDate( start, end );
                    setTabDate( start, end );
                    setInputDate( start, end );
                    setTimepickerDate( start, end );
                }
            };
            
            /**
             * @ngdoc method
             * @name mainDateChanged
             * @methodOf dateRange
             * @description 
             * Method called by ng-change on calendar widget in datepicker.
             * This will update the tabDate, inputDate, and timepickerDate
             */
            scope.mainDateChanged = function() {
                var date = angular.copy( scope.date );
                if( momentStrict( date.start ).isValid() && momentStrict( date.end ).isValid() ) {
                    if ( scope.config.timezone === 'local' ) {
                        date.start = timeUtils.utcToLocal( date.start );
                        date.end = timeUtils.utcToLocal( date.end );
                    }
                    setTabDate( date.start, date.end );
                    setInputDate( date.start, date.end );
                    setTimepickerDate( date.start, date.end );
                }
                scope.getDuration();
                scope.validateInput();
            };
            
            /**
             * @ngdoc method
             * @name tabStartDateChanged
             * @methodOf dateRange
             * @description
             * Method called when start date is change. Will be passed
             * the new (text) value for the start date
             */
            scope.tabStartDateChanged = function(newValue) {
                scope.tabDateChanged(newValue, scope.model.tabDate.end);
            };
            
            /**
             * @ngdoc method
             * @name tabEndDateChanged
             * @methodOf dateRange
             * @description
             * Method called when end date is change. Will be passed
             * the new (text) value for the end date
             */
            scope.tabEndDateChanged = function(newValue) {
                scope.tabDateChanged(scope.model.tabDate.start, newValue);
            };

            /**
             * @ngdoc method
             * @name tabDateChanged
             * @methodOf dateRange
             * @description 
             * Helper method that contains most of the logic to handle
             * changes to either the start or end date. Used by
             * tabStartDateChange and tabEndDateChanged.
             */
            scope.tabDateChanged = function(start, end) {
                if( momentStrict( start ).isValid() && momentStrict( end ).isValid() ) {
                    setMainDate( start, end );
                    setInputDate( start, end );
                    setTimepickerDate( start, end );
                }

                // These need to be set even if they're invalid so
                // that validateInput fails correctly.
                scope.model.tabDate.start = start;
                scope.model.tabDate.end = end;

                scope.getDuration();
                scope.validateInput();
            };
            
            /**
             * @ngdoc method
             * @name inputDateChanged
             * @methodOf dateRange
             * @description 
             * Method called by ng-change on datepicker input field containing truncated ISO 8601 string
             * This will update the mainDate, tabDate, and timepickerDate
             */
            scope.inputDateChanged = function() {
                var inputDate = angular.copy( scope.model.inputDate );
                var mainDate = angular.copy( scope.date );
                var date = {};
                date.start = momentStrict({ 
                    years: momentStrict( inputDate.start ).year(), 
                    months: momentStrict( inputDate.start ).month(), 
                    days: momentStrict( inputDate.start ).date(), 
                    hours: momentStrict( mainDate.start ).hour(), 
                    minutes: momentStrict( mainDate.start ).minute(), 
                    seconds: momentStrict( mainDate.start ).second(), 
                    milliseconds: 0 
                    }).toDate();
                date.end = momentStrict({ 
                    years: momentStrict( inputDate.end ).year(), 
                    months: momentStrict( inputDate.end ).month(), 
                    days: momentStrict( inputDate.end ).date(), 
                    hours: momentStrict( mainDate.end ).hour(), 
                    minutes: momentStrict( mainDate.end ).minute(), 
                    seconds: momentStrict( mainDate.end ).second(), 
                    milliseconds: 0 
                    }).toDate();
                if( momentStrict( date.start ).isValid() && momentStrict( date.end ).isValid() ) {
                    setMainDate( date.start, date.end );
                    setTabDate( date.start, date.end );
                    setTimepickerDate( date.start, date.end );
                }
                scope.getDuration();
                scope.validateInput();
            }
            
            /**
             * @ngdoc method
             * @name timepickerDateChanged
             * @methodOf dateRange
             * @description 
             * Method called by ng-change on Bootstrap timepicker in datepicker
             * This will update the mainDate, tabDate, and inputDate
             */
            scope.timepickerDateChanged = function() {
                var date = angular.copy( scope.model.timepicker );
                if ( momentStrict( date.start ).isValid() && momentStrict( date.end ).isValid() ) {
                    date.start = timeUtils.utcToLocal( date.start );
                    date.end = timeUtils.utcToLocal( date.end );
                }
                setMainDate( date.start, date.end );
                setTabDate( date.start, date.end );
                setInputDate( date.start, date.end );
                scope.getDuration();
                scope.validateInput();
            };
            
            /**
             * @ngdoc method
             * @name initViewDates
             * @methodOf dateRange
             * @description 
             * Set initial values for tabDate, inputDate, timepickerDate, and duration given scope.date
             */
            scope.initViewDates = function() {
                // Set Moment.JS date objects to a single local object for easier management
                var momentDates = getMomentDates();
                setInputDate( scope.date.start, scope.date.end );
                setTabDate( scope.date.start, scope.date.end );
                setTimepickerDate( scope.date.start, scope.date.end );
                scope.getDuration();
                scope.validateInput()
            }
            scope.initViewDates();

            scope.init();
        }
    };
}

var annotatedDirective = [].concat(dependencies);
annotatedDirective.push(datepickerDirectiveFn);

angular.module( 'laspDatePicker').directive('datepickerMinimal', annotatedDirective);

})();

(function() {

var dependencies = [
    'datepickerBase',
    'timeUtils',
    'momentStrict'
];

function datepickerDirectiveFn(DatepickerBase, timeUtils, momentStrict) {
    return {
        restrict: 'E',
        templateUrl: 'datepicker-year/datepicker-year.template.html',
        scope: {
            config: '=',
            date: '='
        },
        link: function(scope, element) {
            
            var datepickerBase = new DatepickerBase(scope, element);

            angular.extend(
                scope.model,
                {
                    inputDate: {
                        start: datepickerBase.getFullYear(scope.date.start),
                        end: datepickerBase.getFullYear(scope.date.end)
                    }
                }
            );

            scope.timezone = DatepickerBase.TIMEZONES.indexOf(scope.timezone) === -1
                ? 'utc'
                : scope.timezone;

            var resetValidation = function() {
                datepickerBase.resetValidation();
            };

            var getMomentDates = function() {
                return {
                    mainStart: momentStrict(scope.date.start),
                    mainEnd: momentStrict(scope.date.end)
                };
            }

            // Note: mostly only sticking this on the scope
            // for testing purposes. You probably shouldn't
            // call it directly.
            var validateInputs = scope.validateInputs = function() {

                var momentDates = getMomentDates();

                var mainStart = momentDates.mainStart;
                var mainEnd = momentDates.mainEnd;

                var allStartsValid =
                    typeof scope.model.inputDate.start == "number" &&
                    !isNaN(scope.model.inputDate.start) &&
                    mainStart.isValid();

                var allEndsValid =
                    typeof scope.model.inputDate.end == "number" &&
                    !isNaN(scope.model.inputDate.end) &&
                    mainEnd.isValid();

                var allTimesValid = allStartsValid && allEndsValid;

                var endIsAfterStart =
                    allTimesValid &&
                    scope.model.inputDate.end > scope.model.inputDate.start &&
                    mainEnd.valueOf() > mainStart.valueOf();

                var allValid = allTimesValid && endIsAfterStart;

                resetValidation();

                if ( allValid ) {
                    return;
                }
                else if ( !allTimesValid ) {
                    var startEndTimeStr = !allStartsValid ? 'Start year' : 'End year';
                    scope.model.validationError = startEndTimeStr + ' must be a number';

                    if (!allStartsValid) {
                        scope.model.startDateStyle = DatepickerBase.STYLE_INVALID;
                    }
                    if (!allEndsValid) {
                        scope.model.endDateStyle = DatepickerBase.STYLE_INVALID;
                    }
                    return;
                }
                else if( !endIsAfterStart ) {
                    scope.model.validationError = 'Please enter a start year that falls before the end year';
                    scope.model.startDateStyle = DatepickerBase.STYLE_INVALID;
                    scope.model.endDateStyle = DatepickerBase.STYLE_INVALID;
                    return;
                }
                else {
                    throw 'Programming error: some failure case is not tested for';
                }
            };

            scope.inputDateChanged = function() {
                datepickerBase.setFullYear(
                    scope.date.start,
                    scope.model.inputDate.start
                );
                datepickerBase.setFullYear(
                    scope.date.end,
                    scope.model.inputDate.end
                );

                validateInputs();
            };

            validateInputs();
            
            // This watcher is only used to update the model when scope.date is changed outside of the datepicker directive
            scope.$watch('date', function() {
                // When scope.date is updated outside of the datepicker, we need to explicity set the flag scope.date.updateFromParent.
                // This way we won't catch extraneous changes to scope.date
                if ( scope.date.updateFromParent && scope.date.updateFromParent === true ) {
                    scope.date.updateFromParent = false;
                    scope.model.inputDate.start = datepickerBase.getFullYear( scope.date.start );
                    scope.model.inputDate.end = datepickerBase.getFullYear( scope.date.end );
                    scope.validateInputs();
                }
            }, true);
        }
    };
}

var annotatedDirective = [].concat(dependencies);
annotatedDirective.push(datepickerDirectiveFn);

angular.module( 'laspDatePicker').directive('datepickerYear', annotatedDirective);

})();

(function() {

var dependencies = [
    'datepickerBase',
    'timeUtils',
    'momentStrict',
    '$document'
];


function offsetDirectiveFn(DatepickerBase, timeUtils, momentStrict, $document) {
    return {
        restrict: 'E',
        templateUrl: 'datepicker-offset/datepicker-offset.template.html',
        scope: {
            config: '=',          // includes .timezone, .timeFormat, and .zeroOffsetDate
            model: '='            // includes .scalar and .period
        },
        link: function(scope, element) {
            
            // datepickerBase overrides scope.model, so give it its own "scope"
            scope.baseScope = {};
            var datepickerBase = new DatepickerBase(scope.baseScope, element);
            
            scope.vm = {
                absolute: 0,
                scalar: 0,
                period: 's'
            };

            // default model: 0 seconds.
            scope.model.scalar = scope.model.scalar || 0;
            scope.model.period = scope.model.period || 's';
            
            /* Default time format is passed as 'YYYY-MM-DD' or 'YYYY-DDDD' when instantiating directive.
             * Double check that format is one of the two values that we'd expect, or use the ISO standard
             * format.
             */
            scope.config.timeFormat = (DatepickerBase.TIME_FORMATS.indexOf(scope.config.timeFormat) === -1)
                ? DatepickerBase.ISO_STANDARD_FORMAT
                : scope.config.timeFormat;
            scope.config.timezone = ( scope.config.timezone === 'utc' || scope.config.timezone === 'local') ? 
                                        scope.config.timezone : 'utc';
            

            
            scope.updateAbsoluteFromRelative = function() {
                if ( scope.vm.scalar === null ) {
                    return;
                }
                // set the absolute input field based on the zeroOffsetDate + relative duration
                var msDuration = moment.duration( scope.vm.scalar, scope.vm.period ).asMilliseconds();
                var displayDate = momentStrict.utc( scope.config.zeroOffsetDate ).add( msDuration, 'ms' );
                if ( scope.config.timezone === 'local' ) {
                    // convert the utc time to a local datestring
                    displayDate = momentStrict.utc( timeUtils.utcToLocal( displayDate.toDate() ) );
                }
                scope.vm.absolute = displayDate.format( scope.config.timeFormat + 'THH:mm:ss' );
                validate();

                updateModelFromInputs();
            };

            scope.updateRelativeFromAbsolute = function() {
                if ( !validate() ) {
                    return;
                }
                // set the relative duration fields based on absolute date - zeroOffsetDate
                var displayDate = momentStrict.utc( scope.vm.absolute ).toDate();
                if ( scope.config.timezone === 'local' ) {
                    // convert a datestring in a local tz to a utc date.
                    displayDate = timeUtils.localToUtc( displayDate );
                }
                var zeroDate = momentStrict.utc( scope.config.zeroOffsetDate );

                var diffMs = ( displayDate.getTime() - zeroDate.toDate().getTime() );
                // Find the most friendly period to use.
                // Only use a certain period if the scalar would be >= 3
                // i.e. a period of 2 hours would actually display as 120 minutes,
                // but 3 hours would display as 3 hours
                var duration = moment.duration( diffMs, 'ms' );
                if ( Math.abs(duration.asYears()) >= 3 ) {
                    scope.vm.scalar = duration.asYears();
                    scope.vm.period = 'y';
                } else if ( Math.abs(duration.asDays()) >= 3 ) {
                    scope.vm.scalar = duration.asDays();
                    scope.vm.period = 'd';
                } else if ( Math.abs(duration.asHours()) >= 3 ) {
                    scope.vm.scalar = duration.asHours();
                    scope.vm.period = 'h';
                } else if ( Math.abs(duration.asMinutes()) >= 3 ) {
                    scope.vm.scalar = duration.asMinutes();
                    scope.vm.period = 'm';
                } else {
                    scope.vm.scalar = duration.asSeconds();
                    scope.vm.period = 's';
                }

                updateModelFromInputs();
            };

            // when the model or zero-offset-date changes, update the displayed values
            scope.$watchGroup( ['model.scalar', 'model.period', 'config.zeroOffsetDate'], function(newVals, oldVals) {
                if ( newVals[0] === undefined || angular.equals(newVals, oldVals) ) return;
                updateInputsFromModel();
            }, true );

            function updateInputsFromModel() {
                // make the input elements reflect the values in scope.model
                scope.vm.scalar = scope.model.scalar;
                scope.vm.period = scope.model.period;

                scope.updateAbsoluteFromRelative();
            }

            function updateModelFromInputs() {
                // make scope.model reflect the values in the input elements
                var newModel = {
                    scalar: scope.vm.scalar,
                    period: scope.vm.period
                };
                if ( angular.equals(scope.model, newModel) ) {
                    return;
                }
                if ( newModel.scalar !== null ) {
                    scope.model.scalar = newModel.scalar;
                }
                scope.model.period = newModel.period;
            }

            function validate() {
                if ( !momentStrict( scope.vm.absolute ).isValid() ) {
                    scope.baseScope.model.validationError = 'Absolute start time must follow the format "' + scope.config.timeFormat + 'THH:mm:ss' + '"';
                    scope.inputStyle = DatepickerBase.STYLE_INVALID;
                    return false;
                }
                resetValidation();
                return true;
            }

            function resetValidation() {
                datepickerBase.resetValidation();
                scope.inputStyle = DatepickerBase.STYLE_VALID;
            }

            resetValidation();
            updateInputsFromModel();
            
        }
    };
}

var annotatedDirective = [].concat(dependencies);
annotatedDirective.push(offsetDirectiveFn);

angular.module( 'laspDatePicker').directive('datepickerOffset', annotatedDirective);

})();
angular.module("laspDatePicker").run(["$templateCache", function($templateCache) {$templateCache.put("datepicker-date/datepicker-date.template.html","<div class=\"lasp-datepicker date\"><div class=\"datepicker\"><div class=\"date-input-ctnr\"><label class=\"dr-label\">Start Date</label><br><input class=\"form-control date-box disabled\" uib-datepicker-popup=\"yyyy-MM-dd\" is-open=\"model.dateOpenedStart\" ng-model=\"calculated.jsDateMidnightLocal.start\" ng-change=\"onCalculatedJsDateMidnightLocalStartChanged()\" close-text=\"Cancel\" style=\"float:left;\" type=\"text\"><div class=\"date-input-row\"><input class=\"date-input form-control date-box\" ng-style=\"model.startDateStyle\" ng-model=\"calculated.str.start\" ng-change=\"onCalculatedStrChanged()\" type=\"text\"> <span class=\"input-group-btn calendar-icon\"><button class=\"btn btn-default\" ng-click=\"toggleStartPicker($event)\" type=\"button\"><i class=\"glyphicon glyphicon-calendar\"></i></button></span></div></div><div class=\"date-input-ctnr\"><label class=\"dr-label\">End Date</label><br><input class=\"form-control date-box disabled\" uib-datepicker-popup=\"yyyy-MM-dd\" is-open=\"model.dateOpenedEnd\" ng-style=\"model.endDateStyle\" ng-model=\"calculated.jsDateMidnightLocal.end\" ng-change=\"onCalculatedJsDateMidnightLocalEndChanged()\" close-text=\"Cancel\" style=\"float:left;\" type=\"text\"><div class=\"date-input-row\"><input class=\"date-input form-control date-box\" is-open=\"model.dateOpenedEnd\" ng-style=\"model.endDateStyle\" ng-model=\"calculated.str.end\" ng-change=\"onCalculatedStrChanged()\" type=\"text\"> <span class=\"input-group-btn calendar-icon\"><button class=\"btn btn-default\" ng-click=\"toggleEndPicker($event)\" type=\"button\"><i class=\"glyphicon glyphicon-calendar\"></i></button></span></div></div></div><div class=\"validation-error text-danger\">{{ model.validationError }}</div></div><div class=\"lasp-datepicker clear\" style=\"margin-bottom:1em;\"></div>");
$templateCache.put("datepicker-duration/datepicker-duration.template.html","<div class=\"lasp-datepicker duration\"><span ng-if=\"label !== undefined\"><label class=\"dr-label\">{{label}}</label><br></span><div style=\"float:left;font-size:15px;line-height:34px;margin-left:5px;\" ng-if=\"relativeTo !== undefined\">{{relativeTo}} &nbsp;&nbsp;{{relativeSymbol}}&nbsp;&nbsp;</div><div class=\"duration-picker input-append\"><input min=\"0\" step=\"any\" style=\"width:5em;\" ng-style=\"style\" ng-model=\"model.duration\" ng-change=\"onNumberChange()\" type=\"number\"> <span class=\"add-on\"><select ng-model=\"model.durationMultiplier\" ng-change=\"onMultiplierChange()\"><option value=\"86400000\">Days</option><option value=\"3600000\">Hours</option><option value=\"60000\">Min.</option><option value=\"1000\">Sec.</option></select></span></div></div>");
$templateCache.put("datepicker-minimal/date-input.template.html","<div><label class=\"date-input-title\">{{title}}</label><br><input class=\"date-input-textinput minimal-input form-control\" type=\"text\" ng-model=\"model\" ng-style=\"style\" ng-change=\"onChange({newValue:model})\" ng-focus=\"onFocus()\"></div>");
$templateCache.put("datepicker-minimal/datepicker-minimal.template.html","<div class=\"lasp-datepicker datetime_minimal\"><div class=\"timezone-select\"><label class=\"dr-label\"><input ng-model=\"config.timezone\" ng-change=\"changeTimeZone()\" type=\"radio\" value=\"local\"> Local</label> <label class=\"dr-label\"><input ng-model=\"config.timezone\" ng-change=\"changeTimeZone()\" value=\"utc\" type=\"radio\"> UTC</label></div><div class=\"input-ctnr floatctnr\"><date-input x-title=\"Start Date\" x-style=\"model.startDateStyle\" x-on-focus=\"openAdvancedStart()\" x-on-change=\"tabStartDateChanged(newValue)\" model=\"model.tabDate.start\"></date-input><date-input x-title=\"End Date\" x-style=\"model.endDateStyle\" x-on-focus=\"openAdvancedEnd()\" x-on-change=\"tabEndDateChanged(newValue)\" model=\"model.tabDate.end\"></date-input><div class=\"right time-format-select\"><label class=\"dr-label\">Date Format</label><br><select ng-model=\"config.timeFormat\" ng-change=\"updateTimeFormat()\" class=\"form-control\"><option value=\"YYYY-MM-DD\">YYYY-MM-DD</option><option value=\"YYYY-DDDD\">YYYY-DDD</option></select></div></div><div tabindex=\"-1\" class=\"advancedSettingsContainer advancedSettingsBefore\" ng-class=\"{\'advancedSettingsAfter\' : model.showAdvancedStart || model.showAdvancedEnd}\"><div class=\"arrow-up\" style=\"margin-left:8%;\" ng-show=\"model.showAdvancedStart\"></div><div class=\"date-tab datepicker advancedSettings\" ng-show=\"model.showAdvancedStart\"><div class=\"advanced-settings-module\"><label class=\"dr-label\">Absolute Start Time</label><br><input class=\"form-control date-box disabled\" uib-datepicker-popup=\"yyyy-MM-dd\" is-open=\"model.dateOpenedStart\" ng-style=\"model.startDateStyle\" ng-model=\"date.start\" ng-change=\"mainDateChanged()\" close-text=\"Cancel\" style=\"float:left;\" type=\"text\"><input class=\"form-control date-box\" is-open=\"model.dateOpenedStart\" ng-style=\"model.startDateStyle\" ng-model=\"model.inputDate.start\" ng-change=\"inputDateChanged()\" style=\"width:40%;float:left;border-top-right-radius:0;border-bottom-right-radius:0;\" type=\"text\"><span class=\"calendar-icon\"><button class=\"btn btn-default\" ng-click=\"toggleStartPicker($event)\" type=\"button\"><i class=\"glyphicon glyphicon-calendar\"></i></button></span><uib-timepicker class=\"timepicker\" ng-model=\"model.timepicker.start\" show-meridian=\"false\" ng-change=\"timepickerDateChanged()\"></uib-timepicker></div><div class=\"or\">OR</div><div class=\"advanced-settings-module border-left\"><datepicker-duration label=\"Start Time Relative to End\" relative-to=\"End Time\" relative-symbol=\"-\" on-number-change=\"updateTimeStart\" on-multiplier-change=\"getDuration\" model=\"model\" style=\"model.durationStyle\"></datepicker-duration></div></div><div class=\"arrow-up\" style=\"margin-left:45%;\" ng-show=\"model.showAdvancedEnd\"></div><div class=\"date-tab datepicker advancedSettings\" ng-show=\"model.showAdvancedEnd\"><div class=\"advanced-settings-module\"><label class=\"dr-label\">Absolute End Time</label><br><input class=\"form-control date-box disabled\" uib-datepicker-popup=\"yyyy-MM-dd\" is-open=\"model.dateOpenedEnd\" ng-style=\"model.endDateStyle\" ng-model=\"date.end\" ng-change=\"mainDateChanged()\" close-text=\"Cancel\" style=\"float:left;\" type=\"text\"><input class=\"form-control date-box\" is-open=\"model.dateOpenedEnd\" ng-style=\"model.endDateStyle\" ng-model=\"model.inputDate.end\" ng-change=\"inputDateChanged()\" style=\"width:40%;float:left;border-top-right-radius:0;border-bottom-right-radius:0;\" type=\"text\"><span class=\"calendar-icon\"><button class=\"btn btn-default\" ng-click=\"toggleEndPicker($event)\" type=\"button\"><i class=\"glyphicon glyphicon-calendar\"></i></button></span><uib-timepicker class=\"timepicker\" ng-model=\"model.timepicker.end\" show-meridian=\"false\" ng-change=\"timepickerDateChanged()\"></uib-timepicker></div><div class=\"or\">OR</div><div class=\"advanced-settings-module border-left\"><datepicker-duration label=\"End Time Relative to Start\" relative-to=\"Start Time\" relative-symbol=\"+\" on-number-change=\"updateTimeEnd\" on-multiplier-change=\"getDuration\" model=\"model\" style=\"model.durationStyle\"></datepicker-duration></div></div></div><div class=\"validation-error text-danger\">{{ model.validationError }}</div></div><div class=\"lasp-datepicker clear\" style=\"margin-bottom:1em;\"></div>");
$templateCache.put("datepicker-offset/datepicker-offset.template.html","<div class=\"lasp-datepicker offset clearfix\"><div class=\"offset-absolute\"><label>Absolute start time</label> <input class=\"form-control\" ng-model=\"vm.absolute\" ng-change=\"updateRelativeFromAbsolute()\" ng-style=\"inputStyle\"></div><div class=\"offset-or\">OR</div><div class=\"offset-duration\"><label>Relative start time</label><div class=\"duration-picker input-append\"><input step=\"any\" type=\"number\" ng-model=\"vm.scalar\" ng-change=\"updateAbsoluteFromRelative()\"> <span class=\"add-on\"><select ng-model=\"vm.period\" ng-change=\"updateAbsoluteFromRelative()\"><option value=\"y\">Years</option><option value=\"d\">Days</option><option value=\"h\">Hours</option><option value=\"m\">Min.</option><option value=\"s\">Sec.</option></select></span></div></div></div><p class=\"small\">Using <span ng-if=\"config.timezone === \'utc\'\">UTC</span> <span ng-if=\"config.timezone === \'local\'\">local timezone</span></p><p class=\"validation-error text-danger\">{{ baseScope.model.validationError }}</p>");
$templateCache.put("datepicker-year/datepicker-year.template.html","<div class=\"lasp-datepicker year\"><div class=\"datepicker\"><div class=\"date-input-ctnr\"><label class=\"dr-label\">Start Year</label><br><input class=\"date-input\" ng-style=\"model.startDateStyle\" ng-model=\"model.inputDate.start\" ng-change=\"inputDateChanged()\" type=\"number\"></div><div class=\"date-input-ctnr\"><label class=\"dr-label\">End Year</label><br><input class=\"date-input\" ng-style=\"model.endDateStyle\" ng-model=\"model.inputDate.end\" ng-change=\"inputDateChanged()\" type=\"number\"></div></div><div class=\"validation-error text-danger\">{{ model.validationError }}</div></div><div class=\"lasp-datepicker clear\" style=\"margin-bottom:1em;\"></div>");}]);