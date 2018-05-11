'use strict';


/*
 * Returns a shortened or lengthened number based on the desired length.
 * If the number is greater than the desired length, it will return
 * the number in exponential form with the desired exponential length.
 * If the number is less than the desired length, it will suffix zeros
 * until it is the desired length.
 */
angular
    .module("beryllium")
    .filter("numLen", [
        numLenFilter
    ]);

function numLenFilter() {
    // Allows for String.prototype.repeat to work on IE
    if (!String.prototype.repeat) {
        String.prototype.repeat = function(count) {
            'use strict';
            if (this == null) {
                throw new TypeError('can\'t convert ' + this + ' to object');
            }
            var str = '' + this;
            count = +count;
            if (count != count) {
                count = 0;
            }
            if (count < 0) {
                throw new RangeError('repeat count must be non-negative');
            }
            if (count == Infinity) {
                throw new RangeError('repeat count must be less than infinity');
            }
            count = Math.floor(count);
            if (str.length == 0 || count == 0) {
                return '';
            }
            // Ensuring count is a 31-bit integer allows us to heavily optimize the
            // main part. But anyway, most current (August 2014) browsers can't handle
            // strings 1 << 28 chars or longer, so:
            if (str.length * count >= 1 << 28) {
                throw new RangeError('repeat count must not overflow maximum string size');
            }
            var rpt = '';
            for (;;) {
                if ((count & 1) == 1) {
                    rpt += str;
                }
                count >>>= 1;
                if (count == 0) {
                    break;
                }
                str += str;
            }
            return rpt;
        }
    }

    return function(num, desiredLen, expLen) {
        if (typeof(num) === 'number') {
            var numString = num.toLocaleString();
            var numLength = numString.replace('.', '').replace(',', '').replace('-', '').length;
            if (numLength > desiredLen) {
                return num.toExponential(expLen);
            } else if (numLength < desiredLen) {
                if (Number.isInteger(num)) { return numString.concat('.').concat('0'.repeat(desiredLen - numLength)); }
                else { return numString.concat('0'.repeat(desiredLen - numLength)); }
            } else {
                return numString;
            }
        } else {
            return num;
        }
    }
}
