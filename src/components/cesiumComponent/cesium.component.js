(function() {

/**
 * <cesium> component
 *
 * This component renders a Cesium frame onto the page. It accepts
 * sub-components inside the <cesium>...</cesium> tags; it will not
 * render them (unless they're transcluded elements, more on those below),
 * but they will be able to modify the behavior of this
 * component via the API exposed via the controller. This is often
 * used to do things like:
 *
 * 1. Modify how the Cesium Viewer is created/configured
 * 2. Add Entities and Primites to the Cesium Viewer (by default
 * 		there are none)
 * 3. Listen to the onTick event of the Cesium.Clock
 *
 * In order to access the Controller API, inner components and directives
 * should require "^^cesium". How that works, exactly, is different
 * for directives vs components, but it can be done for either. for
 * more details, see:
 *
 * https://docs.angularjs.org/guide/component#intercomponent-communication
 * https://docs.angularjs.org/guide/directive#creating-directives-that-communicate
 *
 * As mentioned above, Cesium has three transclusion slots where you can add app-specific content:
 *
 * 1. highstockPaneContent: content for the highstock pane (the right pane of the split pane view)
 * 2. legendContent: content for the legend
 * 3. sideNavContent: content for the controls sidenav
 *
 * The Controller API:
 *
 * cesium.makeViewer( startTime, endTime, configFn ): Initializes the Cesium.Viewer.
 * 		This *must* be called by an internal directive or the Viewer will never be
 * 		created. Returns a reference to the created Viewer. Also triggers any listeners
 * 		bound by onViewerReady after a 0ms timeout (the timeout allows the caller to
 * 		continue configuring the Viewer, since some configuration can only be done
 * 		after instantiation)
 *
 * cesium.onViewerReady( listener ): Register a listener function that will be called
 * 		and passed the Viewer once it has been created.
 *
 * cesium.setCesiumDates( timeframe ): Given a timeframe object of the form
 * 		{ start: Date, end: Date }, set the startTime and endTime of the associated
 * 		Cesium.Clock instance. This will also trigger the onCesiumDatesChanged binding,
 * 		if it has been bound.
 *
 * cesium.onReferenceFrameChange( listener ): Register a listener that will be called
 * 		with the current reference frame ("inertial" or "planetary") when a change is
 * 		detected.
 *
 * cesium.deleteEntity( entityOrPrimitive ): Utility function that can delete just about
 * 		anything from the Cesium.Viewer. Accepted types are:
 * 		* undefined (does nothing, but occasionally useful)
 * 		* Entity
 * 		* Primitive
 * 		* PrimitiveCollection
 * 		* an Array of any of the above
 *
 * cesium.defaultAvailability(): Utility function that returns a TimeIntervalCollection
 * 		collection representing the full extent of the Cesium.Clock instance's time range.
 * 		This is often useful when creating entities, as in:
 * 			viewer.entities.add({
 * 				// etc
 *				availability: vm.cesium.defaultAvailability()
 * 			})
 */
angular
.module("beryllium")
.component("cesium", {
	templateUrl: "components/cesiumComponent/cesium.component.html",
	transclude: {
		'highstockPaneContent': '?highstockPaneContent',
		'legendContent': '?legendContent',
		'sideNavContent': '?sideNavContent'
	},
	bindings: {
		onCesiumViewerAvailable: '&',
		onCesiumDatesChanged: '&',
		referenceFrame: '<'
	},
	controller: [
		'$scope',
		cesiumController
	]
})
.config(['$httpProvider', function( $httpProvider ) {
	// Include the error message interceptor in the interceptors
	// list that http requests must go through.
	$httpProvider.interceptors.push('errorMessageInterceptor');
}]);

var instanceIndex = 1;

function cesiumController( $scope ) {
	var vm = this;

	vm.cesiumElId = "cesium-render-target-" + (instanceIndex++);

    // Variables related to content visibility
    vm.legendOpen = false;
    vm.plotPaneOpen = true;
    vm.sidenavOpen = false;

    // Variables related to the split pane view
    vm.defaultCesiumPaneSize = 45;
    vm.gutterSize = 8;
    vm.cesiumPaneWidth = 'calc(' + vm.defaultCesiumPaneSize + '% - ' + vm.gutterSize / 2 + 'px)';
    vm.highstockPaneWidth = 'calc(' + (100 - vm.defaultCesiumPaneSize) + '% - ' + vm.gutterSize / 2 + 'px)';

    // Have to wait for the component templates to load via the digest cycle before calling Split
    $scope.$$postDigest(function() {
    	// Initialize the split pane functionality
        Split(['#cesium-container', '#highstock-container'], {
            direction: 'horizontal',
            sizes: [vm.defaultCesiumPaneSize, 100 - vm.defaultCesiumPaneSize],
             gutterSize: vm.gutterSize,
            cursor: 'col-resize',
			onDrag: vm.onPaneDrag
        });
    });

    // Callback for when the split pane gutter is dragged
    vm.onPaneDrag = function() {
    	// some content needs this in order to update its size when the pane widths change.
		// lasp-highstock, for example, won't resize without this.
        $scope.$digest();
    };

	// This is the LASP default Bing Maps API Key.
	Cesium.BingMapsApi.defaultKey = "ApShDVXdpWGlIBVUFqN0tGVEnVpLvvuo3Xoml6WCqTapFRsS31KBf7dr-9WXWbxD";

	vm.$onChanges = function( changesObj ) {
		if( changesObj.hasOwnProperty("referenceFrame") ) {
			referenceFrameChangeListeners.forEach(function( listener ) {
				listener( changesObj.referenceFrame.currentValue );
			});
		}
	};

	vm.makeViewer = function( startTime, endTime, configFn ) {
		configFn = configFn || function() {};

		startTime = Cesium.JulianDate.fromDate( startTime );
		endTime = Cesium.JulianDate.fromDate( endTime );

		var clock = new Cesium.Clock({
			startTime: startTime,
			stopTime: endTime,
			currentTime: startTime,
			clockRange: Cesium.ClockRange.LOOP_STOP,
			multiplier: 1000
		});

		var config = {
			clock: clock,
			fullscreenButton: false
		};

		if( configFn ) {
			config = configFn( config ) || config;
		}

		var viewer = vm.viewer = new Cesium.Viewer( vm.cesiumElId, config );

		// Initialize the referenceFrame's onTick functionality
		referenceFrameListener( vm.referenceFrame );

		// Notify viewerReadyListeners after a brief timeout. This is to allow
		// the caller to have first access to the viewer in case they need to
		// continue configuring it (some configuration can only be done after
		// instantiation)
		setTimeout(
			function() {
				viewerReadyListeners.forEach(function( listener ) {
					listener( viewer );
				});
				vm.onCesiumViewerAvailable({ viewer: viewer });
			},
			0
		);

		return viewer;
	};

	vm.onViewerReady = function( listener ) {
		viewerReadyListeners.push( listener );
	};

	vm.setCesiumDates = function( timeframe ) {
		var min = timeframe.start;
		var max = timeframe.end;

		vm.viewer.clock.startTime = Cesium.JulianDate.fromDate( new Date( min.getTime() ) );
		vm.viewer.clock.stopTime = Cesium.JulianDate.fromDate( new Date( max.getTime() ) );
		vm.viewer.clock.currentTime = Cesium.JulianDate.fromDate( new Date( min.getTime() ) );

		vm.viewer.timeline.zoomTo(
			Cesium.JulianDate.fromDate( new Date( min.getTime() ) ),
			Cesium.JulianDate.fromDate( new Date( max.getTime() ) )
		);

		vm.onCesiumDatesChanged({ timeframe: timeframe });
	};

	vm.onReferenceFrameChange = function( listener ) {
		referenceFrameChangeListeners.push( listener );
	};

	vm.deleteEntity = function( entity ) {
		if( typeof entity === 'undefined' ) {
			return;
		}
		else if( Array.isArray(entity) ) {
			entity.forEach(function(subEntity) {
				if( typeof subEntity !== 'undefined') {
					vm.deleteEntity(subEntity);
				}
			})
		}
		else if( entity.constructor === Cesium.Entity ) {
			vm.viewer.entities.remove(entity);
		}
		else if( entity.constructor === Cesium.Primitive || entity.constructor === Cesium.PrimitiveCollection ) {
			vm.viewer.scene.primitives.remove(entity);
		}
		else {
			throw "Unrecognized type for orbitEntities (" + entity.constructor.name + ")";
		}
	};

	vm.defaultAvailability = function() {
		return new Cesium.TimeIntervalCollection([
			new Cesium.TimeInterval({
				start: vm.viewer.clock.startTime,
				stop: vm.viewer.clock.stopTime
			})
		]);
	};

	var viewerReadyListeners = [];
	var referenceFrameChangeListeners = [];

	vm.onReferenceFrameChange( referenceFrameListener );

    // Toggle the visibility of the highstock plots pane. Retains the previous width before the
    // highstock pane was hidden. Note that this toggles the vm.plotPaneOpen variable as well.
    vm.togglePaneWidths = function() {
        vm.plotPaneOpen = !vm.plotPaneOpen;
        var cesiumContainer = angular.element(document.querySelector('#cesium-container'));
        var highstockContainer = angular.element(document.querySelector('#highstock-container'));
        if(vm.plotPaneOpen) { // Show highstock plots pane
            cesiumContainer.css('width', vm.cesiumPaneWidth);
            highstockContainer.css('width', vm.highstockPaneWidth);
        } else { // Hide highstock plots pane
            vm.cesiumPaneWidth = cesiumContainer.css('width'); // retain current cesium pane width
            vm.highstockPaneWidth = highstockContainer.css('width'); // retain current highstock pane width
            cesiumContainer.css('width', '100%');
            highstockContainer.css('width', '0%');
        }
    };

	function referenceFrameListener( newVal ) {
		if( !vm.viewer ) { return; }

		if( newVal === "inertial" ) {
			vm.viewer.scene.preRender.addEventListener( renderCameraInIcrf );
		}
		else if( newVal === "planetary" ) {
			vm.viewer.camera.lookAtTransform( Cesium.Matrix4.IDENTITY );
			vm.viewer.scene.preRender.removeEventListener( renderCameraInIcrf );
		}
		else {
			throw new Error("Programmer Error: unrecognized value for referenceFrame: '" + newVal + "'");
		}
	}

	function renderCameraInIcrf(scene, time) {
		if (scene.mode !== Cesium.SceneMode.SCENE3D) {
			return;
		}

		var icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(time);
		if (Cesium.defined(icrfToFixed)) {
			var camera = vm.viewer.camera;
			var offset = Cesium.Cartesian3.clone(camera.position);
			var transform = Cesium.Matrix4.fromRotationTranslation(icrfToFixed);
			camera.lookAtTransform(transform, offset);
		}
	}
}

})();
