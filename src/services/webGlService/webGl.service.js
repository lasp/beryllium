(function() {

angular
.module("beryllium")
.service("webGl", [
	function() {
		return {
			isWebGlAvailable: isWebGlAvailable
		}
	}
]);

function isWebGlAvailable() {
	// Source: https://developer.mozilla.org/en-US/Learn/WebGL/By_example/Detect_WebGL
	var canvas = document.createElement("canvas");
	var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
	var success = gl && (gl instanceof WebGLRenderingContext);
	return success;
}

})();
