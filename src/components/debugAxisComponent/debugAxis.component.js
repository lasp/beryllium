(function() {

// <debug-axis> Component
// 
// This component is intended to be used inside the <cesium> component for debugging.
// It renders 6 axis at various lat/lng coordinates around the globe, and labels them
// appropriately. It is intended to be used to verify that surface maps and data maps
// are mapped to their appropriate locations on the globe.
// 
// The axis appear at the following [lat, lng] coordinate:
// [90, 0] (north pole)
// [-90, 0] (south pole)
// 
// [0, 0] ("origin")
// [0, 90] ("east pole", 90deg east of origin)
// [0, 180] ("anti-origin", opposite origin)
// [0, 270] ("west pole", 90deg west of origin)
angular
.module("beryllium")
.component( "debugAxis", {
	template: "",
	require: {
		cesium: "^^cesium"
	},
	controller: [
		debugAxisController
	]
});

function debugAxisController() {
	var vm = this;

	vm.$onInit = function() {

		vm.cesium.onViewerReady(function( viewer ) {

			var ellipsoid = vm.cesium.viewer.terrainProvider._tilingScheme._ellipsoid;

			var LINE_BOTTOM = 0;
			var LINE_TOP = ellipsoid.maximumRadius;
			var LINE_COLOR = Cesium.Color.RED;

			var northPole = drawLine(90, 0);
			var southPole = drawLine(-90, 0);

			var origin = drawLine(0, 0);
			var eastPole = drawLine(0, 90);
			var antiOrigin = drawLine(0, 180);
			var westPole = drawLine(0, 270);

			// Draw a line with standard height, color and label at the passed lat,lng
			// coordinates
			function drawLine( lat, lng ) {
				return viewer.entities.add({
					position: Cesium.Cartesian3.fromDegrees( lng, lat, LINE_TOP, ellipsoid ),
					polyline: {
						positions: Cesium.Cartesian3.fromDegreesArrayHeights(
							[
								lng, lat, LINE_BOTTOM,
								lng, lat, LINE_TOP
							],
							ellipsoid
						),
						material: LINE_COLOR,
						width: 1
					},
					label: {
						text: "Lat: " + lat + ", Lng: " + lng,
						font: "24px sans-serif",
						eyeOffset: new Cesium.Cartesian3(0, 0, -100)
					}
				})
			}
		});
	}
}

})();