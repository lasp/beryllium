(function() {

/**
 * AbstractDataTransformer service
 * 
 * Service returns the AbstractDataTransformer function, which is a subclass
 * of AbstractClass. See AbstractClass for more details.
 * 
 * AbstractDataTransformer implements the same public API as AbstractDataProvider,
 * but instead of requesting data it transforms data from an AbstractDataProvider
 * or another AbstractDataTransformer. This is often useful because it allows
 * developers to encapsulate the request logic from the logic that actually manipulates
 * the data. It can also encapsulate multiple steps in the data manipulation
 * process by chaining together several DataTransformers.
 * 
 * For reference, the public API of AbstractDataProvider which AbstractDataTransformer
 * also implements is:
 * 
 * dataTransformer.dataReady: an instance of Cesium.Event that interested parties
 * 		can use to be notified when new data is ready. See:
 * 		https://cesiumjs.org/Cesium/Build/Documentation/Event.html
 * 
 * dataTransformer.requestReload: a function that takes 0 arguments and requests
 * 		that new data be loaded. This is typically only called during app
 * 		startup or when a Requirements provider's requirements have changed
 * 		(if the instance supports Requirements)
 * 
 * Similar to the AbstractDataProvider, the AbstractDataTransformer may need to 
 * proxy parameters to the parent data provider, or it may need parameters to
 * inform its own transformation processes. Either way the recommended way to do
 * this is by exposing a RequirementsManager as
 * `dataTransformer.requirementsManager`. The subclass instance may then gather
 * the necessary requirements by calling
 * `dataTransformer.requirementsManager.gatherRequirements()`. See RequirementsManager
 * for more details, like how to register a requirements provider.
 */
angular
.module("beryllium")
.service("AbstractDataTransformer", [
	"AbstractClass",
	function( AbstractClass ) {
		
		// AbstractDataTransformer constructor function.
		// Constructor requires one parameters; an instance of AbstractDataProvider
		// that it can bind this instance to.
		var AbstractDataTransformer = AbstractClass.createSubclass(function( dataProvider ) {
			if( !dataProvider ) {
				throw new Error("Programmer Error: 'dataProvider' is a required parameter for a DataTransformer constructor");
			}
			AbstractClass.apply( this );
			var transformer = this;
			
			dataProvider.dataReady.addEventListener(function( data ) {
				var transformedData = transformer.transformData( data );
				transformer.dataReady.raiseEvent( transformedData );
			});

			this.dataReady = new Cesium.Event();

			this.requestReload = function() {
				// Just pass the request up the chain until it reaches some class
				// that can actually request new data
				dataProvider.requestReload();
			};
		});

		// abstract method: This must be implemented by the subclass. 
		// Given raw data from the DataProvider,
		// return an object containing Cesium.Property instances, or other values that
		// are useful to the dependent dataReady listeners
		// 
		// Many subclasses will want to start their implementations with a call to
		// this.gatherRequirements(), but they are not required to.
		AbstractDataTransformer.prototype.transformData = function( data ) {
			throw new Error('Programmer Error: transformData must be implemented by an appropriate subclass');
		};

		return AbstractDataTransformer;
	}
]);

})();
