(function() {

// [collapse-container] directive
//
// This directive is one of three parts of the expand-collapse
// system. The parts are: collapse-container, collapse-trigger,
// collapse-target. They are typically arranged like this:
//
//    <div collapse-container>
//        <div>Title <collapse-trigger></collapse-trigger></div>
//        <collapse-target>
//            <div><!-- content --></div>
//        </collapse-target>
//    </div>
//
// The <collapse-trigger> element is a little up/down arrow
// that controls whether or not the <collapse-target> is
// collapsed. The [collapse-container] simply acts as message
// relay; when the <collapse-trigger> is clicked it sends a
// message up to the [collapse-container]. The [collapse-container]
// then passes the message on to any <collapse-target>s that
// live inside it.
angular
.module("beryllium")
.directive("collapseContainer", [
    function() {

        return {
            restrict: 'A',
            controller: [
                CollapseContainerController
            ]
        };
    }
]);

function CollapseContainerController() {

    var collapseListeners = [];
    var _isCollapsed = false;

    this.onCollapseChange = function( listener ) {
        collapseListeners.push( listener );
        notifyListener( listener );
    };

    this.setCollapsed = function( isCollapsed ) {
        _isCollapsed = isCollapsed;
        collapseListeners.forEach( notifyListener );
    };

    this.toggleCollapsed = function() {
        this.setCollapsed( !_isCollapsed );
    };

    this.isCollapsed = function() {
        return _isCollapsed;
    };

    function notifyListener( listener ) {
        listener( _isCollapsed );
    }
}



})();
