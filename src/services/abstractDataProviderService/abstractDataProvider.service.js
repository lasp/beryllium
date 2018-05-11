(function() {

/**
 * AbstractDataProvider service
 * 
 * Returns the AbstractDataProvider function, which is a subclass of
 * AbstractClass. See AbstractClass for more details.
 * 
 * AbstractDataProvider provides a uniform interface for loading data.  The
 * public API of a DataProvider is as follows:
 * 
 * dataProvider.dataReady: an instance of Cesium.Event that interested parties
 * 		can use to be notified when new data is ready. See:
 * 		https://cesiumjs.org/Cesium/Build/Documentation/Event.html
 * 
 * dataProvider.requestReload: a function that takes 0 arguments and requests
 * 		that new data be loaded. This is typically only called during app
 * 		startup or when a Requirements provider's requirements have changed
 * 		(if the instance supports Requirements)
 * 
 * Since AbstractDataProvider is an "abstract" class, it cannot be instantiated
 * directly. In order to obtain an instance you must instantiate a subclass of
 * AbstractDataProvider that implements the makeRequest method. The method takes
 * in 0 parameters and must return an Angular promise that will resolve when
 * the requested data becomes available.
 * 
 * As hinted at in the requestReload description, a DataProvider will often need
 * to gather parameters before it can request data. If that is necessary, the
 * recommended way to implement that is for the subclass to expose an instance
 * of RequirementsManager as `instance.requirementsManager`, and for the subclass's
 * implementation of makeRequest to contain a call to
 * `instance.requirementsManager.gatherRequirements()`. This returns an instance of
 * Requirements which is a convenience class for accessing varied requirements from
 * multiple sources. See RequirementsManager for more details, like how to 
 * register a requirements provider.
 */
angular
.module('beryllium')
.service('AbstractDataProvider', [
	'AbstractClass',
	function( AbstractClass ) {

		var AbstractDataProvider = AbstractClass.createSubclass(function() {
			AbstractClass.apply( this );
			var provider = this;

			provider.dataReady = new Cesium.Event();

			var currentRequest;
			var loadData = function() {
				if( currentRequest ) {
					if( currentRequest.abort ) {
						currentRequest.abort();
					}
					currentRequest = null;
				}

				var promise = provider.makeRequest();

				// Check for common errors in the subclass implementation
				if( !promise || !promise.then ) {
					throw new Error('Programmer Error: makeRequest must return a promise object');
				}

				promise.then(function( data ) {
					currentRequest = null;
					provider.dataReady.raiseEvent( data );
				});
				currentRequest = promise;
			};

			var loadDataTimeout;
			var loadDataDebounced = function() {
				if( loadDataTimeout ) {
					clearTimeout( loadDataTimeout );
				}
				loadDataTimeout = setTimeout(
					function() {
						loadDataTimeout = null;
						loadData();
					},
					0
				);
			}

			provider.requestReload = loadDataDebounced;
		});

		// Abstract method: must be implemented by the subclass
		// Return an Angular promise that will be resolved when the request is complete.
		// If it is necessary to gather Requirements from dependant objects, it
		// is up to the subclass to maintain and invoke a RequirementsManager.
		AbstractDataProvider.prototype.makeRequest = function() {
			throw new Error('Programmer Error: makeRequest must be implemented by an appropriate subclass');
		};

		return AbstractDataProvider;
	}
]);

})();