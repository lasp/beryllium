(function() {
'use strict';

// Replace moment.createFromInputFallback with this function
// to disable falling back to the native Date object for
// parsing. Beware: that change is global and will affect
// all users of the moment function.
function disableNativeDateFallback(config) {
    config._d = new Date(parseFloat('NaN')); // an invalid date
}

angular.module( 'moment-strict', [] ).service(
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