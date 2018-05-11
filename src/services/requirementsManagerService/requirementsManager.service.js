(function() {

/**
 * RequirementsManager class
 * 
 * This service returns the RequirementsManager function which is intended to
 * be instantiated via `new RequirementsManager()`. The constructor takes 0
 * parameters. The class exposes the following API:
 * 
 * requirementsManager.addRequirementsProvider( providerFn, [context] ): Takes
 *      in a requirements provider function and an optional context. When requirements
 *      are requested via gatherRequirements() the providerFn will be called with
 *      0 parameters on the provided context (or on a null context, if none was provided).
 *      See below for more details about requirements provider functions.
 * 
 * requirementsManager.gatherRequirements(): Takes 0 parameters, gathers requirements
 *      from all registered requirements provider functions, and returns the consolidated
 *      result as a Requirements object.
 * 
 * A "requirements provider function" is a function that takes in 0 parameters and should
 * return an object or undefined. If the return value is undefined it will be ignored
 * completely and will not be accesible from the Requirements object returned from
 * gatherRequirements(). Otherwise, all of the returned objects will be stored inside
 * the returned Requirements object and will be easily queryable using methods on that
 * object. See the Requirements class for more details.
 */
angular
.module("beryllium")
.service("RequirementsManager", [
    "Requirements",
    function( Requirements ) {

        function RequirementsManager() {

            var requirementsProviderObjs = [];

            this.addRequirementsProvider = function( providerFn, context ) {
                requirementsProviderObjs.push({
                    providerFn: providerFn,
                    context: context || null
                });
            };

            this.gatherRequirements = function() {
                var requirementsArray = requirementsProviderObjs
                    .map(function( providerObj ) {
                        return providerObj.providerFn.call( providerObj.context );
                    })
                    .filter(function( requirementsObj ) {
                        // filter out: undefined, falsey values, and empty arrays
                        return (typeof requirementsObj !== "undefined") &&
                            (!!requirementsObj) &&
                            (!Array.isArray(requirementsObj) || requirementsObj.length > 0);
                    });
                return new Requirements( requirementsArray );
            }
        }

        return RequirementsManager;
    }
]);

})();