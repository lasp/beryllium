(function() {

// <collapse-target> directive
//
// See the [collapse-container] directive for more details
angular
.module("beryllium")
.directive("collapseTarget", [
    "$timeout",
    function( $timeout ) {
        return {
            restrict: 'E',
            require: '^^collapseContainer',
            link: function(scope, element, attrs, collapseContainerCtrl) {

                initMaxHeight();

                collapseContainerCtrl.onCollapseChange(function( isCollapsed ) {

                    // Attempt to keep the max-height up-to-date if the element's
                    // height changes
                    var height = elementHeight();
                    if( height !== 0 ) {
                        element.css("max-height", height + "px");
                    }

                    // Add or remove the .collapsed class. If class is removed,
                    // css will fall back to the element-level max-height style
                    // that we set.
                    element.toggleClass( "collapsed", isCollapsed );

                });

                // Repeatedly try to get the height of element. If the measured
                // height is 0, set a timeout and try again later. If the measured
                // height is >0, declare victory, set element's max-height accordingly,
                // and finish.
                function initMaxHeight() {
                    var height = elementHeight();
                    if( height > 0 ) {
                        element.css("max-height", height + "px");
                    }
                    else {
                        $timeout( initMaxHeight, 100 );
                    }
                }

                // There are a lot of different ways to get the height of an element,
                // with annoyingly small levels of nuance between them. This is a
                // convenience function so that we can change it in only one place.
                //
                // clientHeight: height of only the content box
                // offsetHeight: height of the content box + padding + border
                // scrollHeight: height of the stuff *inside* the content box
                //        (will be >clientHeight if you can scroll this element)
                function elementHeight() {
                    return element[0].scrollHeight;
                }

            }
        };
    }
]);

})();
