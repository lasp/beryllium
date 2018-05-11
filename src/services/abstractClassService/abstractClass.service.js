(function() {

/**
 * AbstractClass service
 * 
 * Service returns the AbstractClass function, which can be used to create
 * other 'class' functions.
 * 
 * Many of the services in the beryllium module use prototypal inheritance.
 * There are a lot of ways that prototypal inheritance can be implemented,
 * with subtle differences between all of them. I've created this 'class'
 * to provide a standard implementation through all of my services, and to
 * act as a superclass to all classes created this way.
 * 
 * Some notes about this particular implementation:
 * 
 * 1. The subclass prototype is created using Object.create( superclass.prototype ),
 * 		which increasingly seems like the standard way to do this.
 * 2. The property subclass.prototype.constructor is set to subclass,
 * 		in order to match "normal" class functions more closely.
 * 3. All "static" properties on superclass are copied shallowly from
 * 		superclass to subclass during createSubclass. This allows static
 * 		properties to be "inherited" as well, although things get confusing
 * 		quickly if you try to modify these properties (but then again,
 * 		mutable static properties are dangerous for other reasons as well,
 * 		so probably best to avoid modifying them anyway).
 * 
 * One "static" property is exposed on AbstractClass: createSubclass. Usage is
 * like this:
 * 
 * var Subclass = AbstractClass.createSubclass( optionalConstructorFunction );
 * 
 * Subclass.prototype.foo = function(){ console.log("foo"); }
 * var subclassInstance = new Subclass();
 * subclassInstance.foo();
 * 
 * var SubSubclass = Subclass.createSubclass( optionalConstructorFunction );
 * 
 * SubSubclass.prototype.bar = function() { console.log("bar"); }
 * var subsubclassInstance = new SubSubclass();
 * subsubclassInstance.foo();
 * subsubclassInstance.bar();
 */
angular
.module("beryllium")
.service("AbstractClass", [
	function() {
		return AbstractClass;
	}
]);

function AbstractClass() {

}

// Create a subclass of this class. If a constructor function is passed to
// this function, it will be turned into the subclass and returned, otherwise
// an empty function will be created, subclass-ified, and returned.
// 
// Note that the returned subclass will also have a createSubclass function,
// so that subclasses of the returned subclass can also be created, and so on.
AbstractClass.createSubclass = function( constructor ) {
	var superclass = this;

	var subclass = constructor || function() { };
	subclass.prototype = Object.create( superclass.prototype );
	subclass.prototype.constructor = subclass;

	Object.keys( this ).forEach( function(key) {
		subclass[key] = superclass[key];
	});

	return subclass;
};


})();