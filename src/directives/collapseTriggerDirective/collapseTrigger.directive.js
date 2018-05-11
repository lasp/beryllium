(function() {

// <collapse-trigger> directive
//
// See the [collapse-container] directive for more details
angular
.module("beryllium")
.directive("collapseTrigger", [
    function() {
        return {
            restrict: 'E',
            template: "<md-icon>{{className}}</md-icon>",
            require: '^^collapseContainer',
            scope: {},
            link: function(scope, element, attrs, collapseContainerCtrl) {

                var vm = scope;

                // This will be initialized once we get the current isCollapsed
                // state from the collapseContainerCtrl
                vm.className = "";

                element.on("click", function(e) {
                    collapseContainerCtrl.toggleCollapsed();
                });

                collapseContainerCtrl.onCollapseChange(function( isCollapsed ) {
                    vm.className = isCollapsed ? "expand_more" : "expand_less";

                    // Most of the time when this event is triggered, we're not in a digest
                    // cycle (happens during a click event) and so we need to call $digest.
                    // However, the first time this gets called is while we're registering
                    // the event handler and that does happen to be inside a digest loop.
                    // This is apparently really not how you're supposed to do this sort
                    // of thing, but I haven't come across any better solutions yet.
                    //
                    // http://stackoverflow.com/questions/12729122/angularjs-prevent-error-digest-already-in-progress-when-calling-scope-apply
                    if( !(scope.$$phase || scope.$root.$$phase) ){
                      scope.$digest();
                    }
                });

            }
        };
    }
]);

})();
