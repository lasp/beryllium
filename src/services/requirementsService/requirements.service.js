(function() {

/**
 * Requirements service
 * 
 * Service returns the Requirements function which is a subclass of
 * AbstractClass. See AbstractClass for more details.
 * 
 * An instance of Requirements is just a wrapper around an array
 * of objects, with some utility methods. The wrapped array is
 * stored as this.requirements
 * 
 * Requirements.prototype.findFirst( name, missingVal ):
 * 		Search through this.requirements for the first object that
 * 		returns true for hasOwnProperty(name) and then return
 * 		that object's 'name' property. If 'name' is not found
 * 		and missingVal was not passed (arguments.length == 1),
 * 		an Error will be thrown. If 'name' is not found and
 * 		missingVal was passed, no Error will be thrown and
 * 		missingVal will be returned instead.
 * 
 * Requirements.prototype.concatAll( name ): Search through
 * 		this.requirements for all objects that have a 'name'
 * 		property and concat together the results into an array.
 */
angular
.module("beryllium")
.service("Requirements", [
	"AbstractClass",
	function( AbstractClass ) {

		var Requirements = AbstractClass.createSubclass(function( requirementsArray ) {
			AbstractClass.call( this );
			this.requirements = requirementsArray;
		});

		// Search through this.requirements for the first object that
		// returns true for hasOwnProperty(name) and then return
		// that object's 'name' property. If 'name' is not found
		// and missingVal was not passed (arguments.length == 1),
		// an Error will be thrown. If 'name' is not found and
		// missingVal was passed, no Error will be thrown and
		// missingVal will be returned instead.
		Requirements.prototype.findFirst = function( name, missingVal ) {
			for( var i=0; i<this.requirements.length; i++ ) {
				var requirementsObj = this.requirements[i];
				if( requirementsObj.hasOwnProperty(name) ) {
					return requirementsObj[name];
				}
			}

			if( arguments.length > 1 ) {
				return missingVal;
			}
			else {
				throw new Error("Developer Error: unable to find requirement '" + name + "'");
			}
		};

		// Search through
		// this.requirements for all objects that have a 'name'
		// property and concat together the results into an array.
		Requirements.prototype.concatAll = function( name ) {
			return this.requirements.reduce(
				function( arr, requirementsObj ) {
					if( requirementsObj.hasOwnProperty(name) ) {
						return arr.concat( requirementsObj[name] );
					}
					else {
						return arr;
					}
				},
				[]
			);
		}

		return Requirements;
	}
]);

})();