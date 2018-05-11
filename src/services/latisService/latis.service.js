(function() {

/**
 * Latis service
 * 
 * Service returns the Latis constructor function. Provides a unified way to
 * make requests to a latis server.
 * 
 * GET requests are automatically cached in the browser using requestCacher.
 * See requestCacher for more details.
 * 
 * Currently only GET requests are supported, but POST support may be added
 * in the future (possibly without caching?)
 * 
 * Latis.prototype.get( dataset, outputType, selectionArray, filterArray ):
 * 		Makes a request to a latis server.
 * 		dataset: (String) the latis dataset to request
 * 		outputType: (String) the output type to request, e.g. "json" or "txt"
 * 		selectionArray: (Array<String>) the parameters to request from the latis server. Pass
 * 			an empty array to request all parameters.
 * 		filterArray: (Array<String>) an array of latis filters such as:
 * 			[ "time>=2016-01-01", "first()" ]
 */
angular
.module("beryllium")
.service("Latis", [
	"requestCacher",
	function( requestCacher ) {

		function Latis( latisBaseUrl ) {
			this.latisBaseUrl = latisBaseUrl;
		}

		Latis.prototype.getUrlExtension = function( dataset, outputType, selectionArray, filterArray ) {
			// Need to copy the filterArray to avoid making
			// changes to the actual filterArray below.
			var filterArrayCopy = filterArray.slice();

            // Join selection and add to filter array. It should come after all other
            // filters in case we're filtering on something that we're not selecting
            if( selectionArray && selectionArray.length ) {
                filterArrayCopy.push( selectionArray.join(",") );
            }

            return dataset + '.' + outputType + '?' +
                filterArrayCopy.join("&");
		};

		Latis.prototype.get = function( dataset, outputType, selectionArray, filterArray ) {

			var url = this.latisBaseUrl + this.getUrlExtension(dataset, outputType, selectionArray, filterArray);

			var basePromise = requestCacher.getUrl( url );

			var mappedPromise = basePromise.then(
				function( data ) {
					if( outputType === "jsond" ) {
						if( data.hasOwnProperty(dataset) ) {
							return data[dataset];
						}
						else {
							var keys = Object.keys(data);
							if( keys.length === 0 ) {
								throw new Error("No properties found on response object");
							}
							else if( keys.length > 1 ) {
								console.warn("Failed to find expected property '" + dataset + "' on response object. Found multiple properties on response object instead. Using first of [" + keys.join(", ") + "]");
								var key = keys[0];
								return data[ key ];
							}
							else {
								var key = keys[0];
								console.warn("Failed to find expected property '" + dataset + "' on response object. Using property '" + key + "' instead.");
								return data[ key ];
							}
						}
					}
					else {
						return data;
					}
				}
			);

			if( basePromise.abort ) {
				mappedPromise.abort = function() {
					basePromise.abort();
				};
			}

			return mappedPromise;
		};

		return Latis;
	}
]);

})();