(function() {

/**
 * asyncCompression service
 *
 * Service provides a way to use the LZString compression
 * and decompression algorithms asynchronously thanks to
 * web workers.
 *
 * compress(value) and decompress(value): Call compressionMaster
 * with the correct input. These are simple methods for external
 * developers to call while also providing compressionMaster as a
 * single function to make changes.
 *
 * compressSync(value) and decompressSync(value): synchronous versions
 * of their corresponding functions.
 *
 * compressionMaster(func, funcName, value): internal function that does
 * all the asynchronous compression and decompression using web workers.
 * If the browser does not support web workers, simply call the LZString
 * equivalent. Note that this returns a promise. There is a function
 * that can extract a function name from a function, but it's not
 * supported by older browsers. For the sake of compatibility we'll have
 * to stick with explicitly specifying it as a string argument.
 *
 * logCompression(lengthBefore, lengthAfter): internal function used
 * to log (as in console.log, not logarithm) how much the compression
 * algorithm has compressed the given value.
 */

angular
.module('beryllium')
.service('asyncCompression', [
    '$q',
    'LZString',
    function( $q, LZString ) {
        return {
            compress: compress,
            compressSync: compressSync,
            decompress: decompress,
            decompressSync: decompressSync
        };

        function compress(value) {
            return compressionMaster(LZString.compress, "LZString.compress", value);
        }

        function compressSync(value) {
            return LZString.compress(value);
        }

        function decompress(value) {
            return compressionMaster(LZString.decompress, "LZString.decompress", value);
        }

        function decompressSync(value) {
            return LZString.decompress(value);
        }

        function compressionMaster(func, funcName, value) {
            // If you change this URL, also change it in bower.json
            var lzStringURL = "https://cdn.rawgit.com/pieroxy/lz-string/86c3934589b0931cec4421549ed714d693b6400e/libs/lz-string.js";

            return $q(function(resolve) {
                if (typeof Worker !== "undefined") { // If web workers are supported by the browser
                    // Web worker code that just compresses/decompresses the given value
                    var blob = new Blob([
                        "importScripts('" + lzStringURL + "');" +
                        "onmessage = function(event) { postMessage(" + funcName + "(event.data)) };"
                    ], {type: "text/javascript"});

                    var worker = new Worker(window.URL.createObjectURL(blob));

                    worker.addEventListener('message', function(event) {
                        // logCompression(value.length, event.data.length);
                        resolve(event.data); // resolves the compressed/decompressed value
                    });

                    worker.postMessage(value); // Passes the web worker the current value
                } else {
                    resolve(func(value));
                }
            });
        }

        function logCompression(lengthBefore, lengthAfter) {
            console.log("LZString compression: " + ((lengthBefore-lengthAfter) * 100 / lengthBefore).toFixed(0) + '%');
        }
    }
]);

})();