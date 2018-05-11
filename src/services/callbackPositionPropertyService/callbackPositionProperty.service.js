(function() {

// CallbackPositionProperty: A CallbackProperty that is also a PositionProperty
//
// This angular service is intended to be an implementation for what I consider to be
// a missing class in the Cesium API: a PositionProperty that can be calculated on
// the fly from a callback function.
// 
// There are similar classes such as ConstantPositionProperty which is described as
// a "ConstantProperty that is also a PositionProperty".
// 
// A PositionProperty is, in theory, just a Property that happens to return a Position
// object from its getValue(time) function. In practice, there is a little more to
// the API that you have to implement (see the Cesium docs for PositionProperty).
// I've implemented that API here as best I know how. Much of the code was copied
// from the code for ConstantPositionProperty and modified to work with a callback
// function. It was also "Angular-ified" so that it would fit better with our
// existing code, even though Cesium is not natively an Angular app.
angular
.module("beryllium")
.service( "CallbackPositionProperty", [
	function() {

		function CallbackPositionProperty( callback, isConstant, referenceFrame ) {
			this._callback = callback;
			this.isConstant = isConstant;
			this.referenceFrame = typeof referenceFrame === "undefined"
				? Cesium.ReferenceFrame.FIXED
				: referenceFrame;
			this.definitionChanged = new Cesium.Event();
		}

		CallbackPositionProperty.prototype = Object.create( Cesium.PositionProperty );

		CallbackPositionProperty.prototype.getValue = function( time, result ) {
			return this.getValueInReferenceFrame( time, Cesium.ReferenceFrame.FIXED, result );
		};

		CallbackPositionProperty.prototype.getValueInReferenceFrame = function( time, referenceFrame, result ) {
			result = this._callback( time, result );
			return Cesium.PositionProperty.convertToReferenceFrame(
				time,
				result,
				this.referenceFrame,
				referenceFrame,
				result
			);
		};

		return CallbackPositionProperty;

	}
]);

})();
