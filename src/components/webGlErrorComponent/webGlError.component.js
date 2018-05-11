(function() {

/**
 * <web-gl-error> component
 * 
 * Displays a simple error message about WebGL.
 * See "webGl" service for related utility methods.
 * 
 * Typical usage:
 * <web-gl-error ng-if="!myCtrl.webGl"></web-gl-error>
 * <my-app ng-if="myCtrl.webGl"></my-app>
 */
angular
.module("beryllium")
.component("webGlError", {
	templateUrl: "components/webGlErrorComponent/webGlError.component.html",
});

})();