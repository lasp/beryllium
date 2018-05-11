(function() {

/**
 * <single-date-picker> component
 * 
 * Utility widget; usually used to pick date ranges in the sideber
 * of a beryllium app.
 */
angular
.module("beryllium")
.component("singleDatePicker", {
	templateUrl: "components/singleDatePickerComponent/singleDatePicker.component.html",
	bindings: {
		availableMinDate: "<",
		availableMaxDate: "<",
        date: "<",

		onChange: "&"
	},
	controller: [
		SingleDatePickerController
	]
});

function SingleDatePickerController() {
	var vm = this;

	vm.format = 'yyyy-MM-dd';

	vm.$onChanges = function( changesObj ) {

		if( changesObj.availableMinDate ) {
			vm.datepickerOptions.minDate = changesObj.availableMinDate.currentValue;
		}
		if( changesObj.availableMaxDate ) {
			vm.datepickerOptions.maxDate = changesObj.availableMaxDate.currentValue;
		}
	};

	vm.datepickerOptions = {
		minDate: vm.availableMinDate,
		maxDate: vm.availableMaxDate
	};

	vm.dateOpened = false;
	vm.openDate = function() {
		vm.dateOpened = true;
	};

	vm.errorObj = {};

	vm.reloadClicked = function() {
		vm.errorObj = {};

		var DAY_IN_MS = 24 * 60 * 60 * 1000; // units = ms

        var dateUTC = asUtc(vm.date).getTime();
        
		var availMin = vm.availableMinDate.getTime();
		var availMax = vm.availableMaxDate.getTime();

		if( dateUTC < availMin ) {
			vm.errorObj.tooEarly = true;
		}
		if( dateUTC > availMax ) {
			vm.errorObj.tooLate = true;
		}
		
		var anyErrors = Object.keys( vm.errorObj ).some(function( key ) {
			return vm.errorObj[key];
		});

        if( !anyErrors ) {
			vm.onChange({ start: vm.date });
		}
    };

    function asUtc( date ) {
        return new Date(Date.UTC(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            date.getHours(),
            date.getMinutes(),
            date.getSeconds(),
            date.getMilliseconds()
        ));
    }
}

})();
