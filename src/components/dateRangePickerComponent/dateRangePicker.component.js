(function() {

/**
 * <date-range-picker> component
 * 
 * Utility widget; usually used to pick date ranges in the sideber
 * of a beryllium app.
 */
angular
.module("beryllium")
.component("dateRangePicker", {
	templateUrl: "components/dateRangePickerComponent/dateRangePicker.component.html",
	bindings: {
		availableMinDate: "<",
		availableMaxDate: "<",
		displayMinDate: "<",
		displayMaxDate: "<",
		maxDurationHours: "@",

		onChange: "&"
	},
	controller: [
		DateRangePickerController
	]
});

function DateRangePickerController() {
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

	vm.minDateOpened = false;
	vm.openMin = function() {
		vm.minDateOpened = true;
	};

	vm.maxDateOpened = false;
	vm.openMax = function() {
		vm.maxDateOpened = true;
	};

	vm.errorObj = {};

	vm.reloadClicked = function() {
		vm.errorObj = {};

		// These are parsed from UI values, so we must convert them to
		// UTC manually (datepicker widget assumes local time, not UTC)
		var displayMin = asUtc( vm.displayMinDate ).getTime();
		var displayMax = asUtc( vm.displayMaxDate ).getTime();

		// Since these are passed to us from an external element, we can
		// assume that they are already correct with regards to UTC
		var availMin = vm.availableMinDate.getTime();
		var availMax = vm.availableMaxDate.getTime();

		var maxDuration = -1;
		if( vm.maxDurationHours ) {
			maxDuration = parseInt(vm.maxDurationHours) * 60 * 60 * 1000; // units = ms
		}

		if( displayMax <= displayMin ) {
			vm.errorObj.endBeforeStart = true;
		}
		if( displayMin < availMin ) {
			vm.errorObj.startTooEarly = true;
		}
		if( displayMax > availMax ) {
			vm.errorObj.endTooLate = true;
		}
		if( maxDuration != -1 && Math.abs(displayMax - displayMin) > maxDuration ) {
			vm.errorObj.rangeTooLarge = true;
		}

		var anyErrors = Object.keys( vm.errorObj ).some(function( key ) {
			return vm.errorObj[key];
		});

		if( !anyErrors ) {
			vm.onChange({ start: vm.displayMinDate, end: vm.displayMaxDate });
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