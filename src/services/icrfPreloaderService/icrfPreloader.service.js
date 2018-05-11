(function() {

angular.module('beryllium')
.service( 'icrfPreloader', [
	"$q",
	function( $q ) {
		return {
			preloadIcrf: preloadIcrf
		};

		function preloadIcrf(startTime, endTime) {
			var julianStart = Cesium.JulianDate.fromDate( startTime );
			var julianEnd = Cesium.JulianDate.fromDate( endTime );

			// Tell Cesium to preload ICRF transform data
			// for the appropriate time frame.
			// 
			// Note: icrfRequest is a Cesium promise, not compatible
			// with angular ($q) promises
			var icrfRequest = Cesium.Transforms.preloadIcrfFixed(
				new Cesium.TimeInterval({
					start: julianStart,
					end: julianEnd
				})
			);

			// This is a hacky but reliable way to tell whether or not the
			// ICRF data has finished loading. In theory you should be able
			// to use Cesium.when( icrfRequest, success, failure ) to wait
			// for the ICRF data to load, however I've had a lot of issues
			// where that didn't work as advertised. So, I've created my own
			// polling loop to test whether the data I need is available.
			// I created another promise (via $q) object that will not
			// resolve until the polling loop succeeds. It can be used in
			// conjunction with other $q promises, e.g. by combining into
			// a single promise via $q.all([ icrfPromise, otherPromise ])
			var icrfPromise = $q(function( resolve, reject ) {

				var toInertial = new Cesium.Matrix3();
				var startTime = new Date().getTime();
				var maxElapsedSec = 10;
				var pollInterval = 50;

				var testIcrfLoaded = function() {
					var now = Date.now();
					var elapsedSec = (now - startTime) / 1000;

					if( elapsedSec > maxElapsedSec ) {
						var msg = "Failed to load ICRF data";
						console.error( msg );
						reject( msg );
						return;
					}

					if(Cesium.defined(
						Cesium.Transforms.computeFixedToIcrfMatrix( julianStart, toInertial )
					))
					{
						resolve();
					}
					else {
						setTimeout(
							function() {
								try {
									testIcrfLoaded();
								}
								catch( e ) { console.error(e); }
							},
							pollInterval
						);
					}
				};

				try {
					testIcrfLoaded();
				}
				catch( e ) { console.error(e); }
			});

			return icrfPromise;
		}
	}
]);

})();

