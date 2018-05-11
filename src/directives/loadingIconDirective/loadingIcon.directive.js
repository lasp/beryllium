(function() {

// [loading-icon] directive
//
// This directive displays the associated element whenever there
// is a pending http request. Example use:
//
//	<div id="loading-indicator" loading-icon>
//      <md-progress-circular md-mode="intermediate"></md-progress-circular>
//  </div>

angular
.module("beryllium")
.directive("loadingIcon", ['$http' ,
    function($http) {
        return {
            restrict: 'A',
            link: function (scope, elm, attrs) {
                scope.$watch(function() {
                    return $http.pendingRequests.length > 0;
                }, function( isPending ) {
                    if (isPending) {
                        $(elm).css('display', 'block');
                    } else {
                        $(elm).css('display', 'none');
                    }
                });
            }
        };
    }
]);

})();