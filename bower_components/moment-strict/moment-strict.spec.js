'use strict'

describe( 'Service: moment-strict', function () {
    
    beforeEach(angular.mock.module( 'moment-strict' ));

    var momentStrict;
    beforeEach(function() {
        var tmp;
        inject(function(momentStrict) { tmp = momentStrict; });
        momentStrict = tmp;
    });

    it( 'should parse valid dates correctly', function() {

        var validDate = momentStrict('1970-01-01');
        expect( validDate.isValid() ).toBe( true );
        expect( validDate.year() ).toBe( 1970 );
        expect( validDate.month() ).toBe( 0 ); // months are 0-indexed
        expect( validDate.date() ).toBe( 1 ); // day of month is 1-indexed
    });

    it( 'should return an invalid date instead of using the browser\'s parser', function() {

        var invalidDate = momentStrict('01/01/1970'); // not a valid ISO 8601 string
        expect( invalidDate.isValid() ).toBe( false );
    });

    it( 'should not affect the global moment\'s fallback function', function() {

        // moment.createFromInputFallback is what moment calls when it's unable
        // to parse an input dateStr withs its standard ISO8601 formats. The
        // default behavior of createFromInputFallback is to delegate to the
        // native Date function (which is evil). You can overwrite this function
        // to change that behavior. Our momentWrapper will overwrite it briefly
        // when called, and this test is to make sure that it puts everything
        // back the way it was when it's done.
        var prevFallback = moment.createFromInputFallback;
        moment.createFromInputFallback = function() {
            throw "Yep, we hit this all right.";
        };
        var invalidDate = momentStrict('01/01/1970');
        expect( invalidDate.isValid() ).toBe( false );

        expect( function() { moment('01/01/1970'); } ).toThrow( "Yep, we hit this all right." );

        // be sure to reset this after we're done or this test will break other tests
        moment.createFromInputFallback = prevFallback;
    });

    it( 'should have a utc function that works like you\'d expect', function() {

        var invalidDate = momentStrict.utc('01/01/1970');
        expect( invalidDate.isValid() ).toBe( false );

        var validDate = momentStrict.utc('1970-01-01');
        expect( validDate.isValid() ).toBe( true );
        expect( validDate.valueOf() ).toBe( 0 ); // Conveniently this is exactly the JS Date epoch.
    });
});