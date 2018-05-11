(function() {

/**
 * requestCacher service
 * 
 * Service provides a mechanism to make GET requests that are automatically
 * cached by their urls. Currently uses sessionStorage as the cache store,
 * but may change in the future. Using sessionStorage means that the cache
 * will be cleared whenever the user closes their browser (as opposed to
 * localStorage which persists through browser restarts for a browser-specific
 * amount of time). If sessionStorage is not available (not all browsers
 * support it), then no caching will be performed.
 * 
 * Internally, the cacher uses compression from LZString to compress the
 * cache contents before storing them. This allows us to store much more
 * data (approx 5x more for standard JSON requests) but sometimes breaks
 * the debug tools in Chrome when you try to inspect sessionStorage. See
 * below for more details.
 * 
 * The cacher also uses a Least Recently Used (LRU) algorithm to clear
 * out older cache entries when a new entry fails to store correctly.
 * 
 * requestCacher.get( url ): If the given url is not found in the cache, make
 * 		a GET request for it. Otherwise, return whatever result is found in
 * 		the cache. Either way, returns a promise that resolves to the requested
 * 		data. If an actual GET request was made, the promise object will
 * 		have an abort() method that you can call to abort the request
 * 		(see the docs for angular's $http for more details)
 */
angular
.module('beryllium')
.service('requestCacher', [
	'$q',
	'$http',
	'asyncCompression',
	function( $q, $http, asyncCompression ) {

		// Enabling DO_COMPRESSION significantly increases the number
		// of items we can store in sessionStorage (by roughly 5x), but
		// it seems to break the Chrome debug tools if you try to view
		// the contents of sessionStorage (compressed strings use a lot
		// of unusual Unicode characters, apparently)
		// 
		// If you just need to clear the cache, run
		// sessionStorage.clear()
		// from the JS console (or any JS script).
		// 
		// If you accidentally freeze your Chrome and you want to
		// unfreeze it, close your browser (all tabs) and restart it.
		// Since we use sessionStorage instead of localStorage this will
		// clear the storage and allow the sessionStorage tab to
		// render correctly. However, you should quickly navigate away
		// from the sessionStorage tab before new values are added and
		// it freezes up again.
		// 
		// If you need to inspect the actual contents of sessionStorage,
		// set DO_COMPRESSION to false.
		// 
		// If you need to inspect the actual contents of sessionStorage
		// while it's compressed... good luck.
		var DO_COMPRESSION = true;

		var STORAGE_KEY_PREFIX = 'ajaxCache_';
		var LRU_KEY_PREFIX = 'ajaxCacheLRU_';

		// Attempt to populate 'storage' with window.sessionStorage. If
		// an error is encountered, leave it as null as a sign that caching
		// is not available.
		var storage = null;
		if( storageAvailable('sessionStorage') ) {
			storage = window.sessionStorage;
		}

		return {
			getUrl: getUrl
		};

		// Given a url, return a promise that will resolve to the contents
		// of that GET request. The contents may or may not come from the
		// cache, you shouldn't have to worry about it.
		function getUrl( url ) {

			var token = DO_COMPRESSION
				? asyncCompression.compressSync( url )
				: url;

			// storageKey will be used to store the actual result and
			// lruKey will be used to store an ISO 8601 token that
			// denotes how old that cache item is.
			var storageKey = STORAGE_KEY_PREFIX + token;
			var lruKey = LRU_KEY_PREFIX + token;

			// If storage is available, try to get the url from storage
			if( storage ) {
				var result = storage.getItem( storageKey );

				// If a result was found in storage, return a promise that
				// resolves to that result. Otherwise, continue on.
				if( result !== null ) {

					// Update the timestamp on this item
					storage.setItem( lruKey, new Date().toISOString() );

					// Return a promise that resolves to the un-compressed,
					// un-JSON-ed result from the cache
					return $q(function(resolve) {
						setTimeout(
							function() {
								if( DO_COMPRESSION ) {
									asyncCompression.decompress( result ).then(
										function( decompressedResult ) {
                                            resolve( JSON.parse( decompressedResult ) );
                                        }
									);
								} else {
                                    resolve( JSON.parse( result ) );
								}
							},
							0
						);
					});
				}
			}

			// Unable to get result from storage for whatever reason, so
			// make the GET request
			var canceler = $q.defer();
			var basePromise = $http({
				method: 'GET',
				url: url,
				timeout: canceler.promise
			});
			var httpPromise = basePromise.then(
				function( response ) {
					// By only returning the response data if it has an
					// successful http status code (aka a status code of 200-299),
					// it prevents it from caching unsuccessful get requests.
					if (response.status >= 200 && response.status < 300) {
						return response.data;
					}
					console.warn("Unsuccessful GET request");
					throw response;
				}
			);
			httpPromise.abort = function() {
				canceler.resolve();
			};

			// If storage is available, attempt to cache the result when
			// the request returns. Be sure not to overwrite the httpPromise
			// object, since we need to preserve its abort() function.
			if( storage ) {
				httpPromise.then( function( result ) {
					var keepTrying = true;
					var success = false;
					var error = null;

					// 1. Attempt to store the result in the cache
					// 2. If attempt fails, assume the cache is full
					// 		and remove the least recently used item
					//		from the cache.
					// 3. If nothing was removed from the cache (i.e.
					//		the cache is empty), give up and write
					//		an error message to the console. Do not
					//		throw; we can still resolve the promise
					//		with the data even if we weren't able to
					//		cache it.
					// 4. If something was removed from the cache,
					//		loop back to #1 and attempt to store
					//		result again
					while( !success && keepTrying ) {
						try {
							storeItem( storageKey, lruKey, result );
							success = true
						}
						catch (e) {
							error = e;
							keepTrying = removeLeastRecentlyUsed();
						}
					}

					// The only thing that I can think of that would cause this
					// is if the whole response is so big that it won't even fit
					// in the cache when the cache is empty. Typical caches are
					// about 5MB. However, most of our responses are JSON, and
					// JSON typically compresses by about 5x, so we'd have to
					// receive about 25mb of JSON before we would fail to cache
					// a single request. That's a friggin lot of JSON - there's
					// probably something else going wonky at that point.
					if( !success ) {
						console.warn("requestCacher storage insert failure: " + (error.message || error));
					}
				} );
			}

			return httpPromise;
		}

		// Simple function to test if sessionStorage/localStorage is available.
		// I saw this on StackOverflow originally, and modified it to suit my
		// needs. I didn't think to copy down the URL though.
		function storageAvailable(type) {
			try {
				var storage = window[type],
					x = '__storage_test__';
				storage.setItem(x, x);
				storage.removeItem(x);
				return true;
			}
			catch(e) {
				return false;
			}
		}

        // Wrapper method for storage.setItem that also handles
		// JSON stringification, compression and whatever else we
		// may decide is useful in the future
        function storeItem( storageKey, lruKey, value ) {
            value = JSON.stringify( value );

            var doStore = function( value ) {
                storage.setItem(
                    storageKey,
                    value
                );
                storage.setItem(
                    lruKey,
                    new Date().toISOString()
                );
            };

            if( DO_COMPRESSION ) {
                asyncCompression.compress( value ).then( doStore );
            } else {
                doStore( value );
            }
        }

		// Return a list of all keys living inside the storage object. This is surprisingly
		// a pain in the butt, so I wrapped it up in a helper method.
		function storageKeys() {
			var keys = [];
			var i = storage.length;
			while( i-- ) {
				keys.push( storage.key(i) );
			}
			return keys;
		}

		// Remove the least recently used item from the cache so that we can free up some
		// more space for new items. Return true if an item was successfully removed or
		// false if there were no more items to remove.
		function removeLeastRecentlyUsed() {
			var keys = storageKeys().filter(function(key) { return key.indexOf( LRU_KEY_PREFIX ) === 0; });
			if( keys.length === 0 ) {
				return false;
			}

			var timestamps = keys
				.map(
					function(key) { return new Date(storage.getItem(key)); }
				)
				.sort(
					function(a, b) { return a.getTime() - b.getTime(); }
				);
			var leastRecentlyUsedLRUKey = keys[0];
			var leastRecentlyUsedKey = STORAGE_KEY_PREFIX + leastRecentlyUsedLRUKey.substring( LRU_KEY_PREFIX.length );

			storage.removeItem( leastRecentlyUsedKey );
			storage.removeItem( leastRecentlyUsedLRUKey );
			return true;
		}
	}
]);

})();