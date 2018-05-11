(function() {

angular
.module( 'beryllium', [ 'angular-sortable-view', 'laspChart', 'LZString', 'moment-strict', 'ngMaterial', 'ngMessages', 'ngSanitize', 'ui.bootstrap' ])
.config([
    '$mdDateLocaleProvider',
    function( $mdDateLocaleProvider ) {
        $mdDateLocaleProvider.formatDate = function( date ) {
            if( !date ) {
                return "";
            }
            else {
                return date.toISOString().split('T')[0];
            }
        }
    }
]);

})();