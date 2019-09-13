/*
* This function "hacks" the default title renderer and adds it to the main legend group instead
* of creating its own group. This means that we can render the title and legend items in a single line
* instead of the default 2 lines. This code originates from highstock source code.
*/
(function (H) {
    // Hide the tooltip but allow the crosshair
    H.Tooltip.prototype.defaultFormatter = function () { return false; };
    // This function is provided by highstock to overwrite default behaviour
    H.wrap(H.Legend.prototype, 'renderTitle', function() {
        var legend = this;
        var options = legend.options;
        var padding = legend.padding;
        var titleOptions = options.title;
        var titleHeight = 0;
        var bBox;
        var chart = legend.chart;
        var widthOption = options.width;
        var initialItemX = legend.initialItemX;

        var text = legend.title && legend.title.text ? legend.title.text.textStr : titleOptions.text;

        if (text) {
            if (!legend.title) {
                legend.title = legend.chart.renderer.label(text, padding - 3, padding - 5, null, null, null, null, null, 'legend-title')
                    .attr({ zIndex: 1 })
                    .css(titleOptions.style)
                    .add(legend.group);
            }
            bBox = legend.title.getBBox();
            titleHeight = bBox.height;

            legend.offsetWidth = bBox.width;

            // advance the x value for the next legend item
            legend.itemX += bBox.width + 8;

            // if the item exceeds the width, start a new line
            if ( legend.itemX - initialItemX + bBox.width + 16 > (widthOption || (chart.chartWidth - 2 * padding - initialItemX - options.x))) {
                legend.itemX = initialItemX;
                legend.itemY += legend.lastLineHeight;
                legend.lastLineHeight = 0; // reset for next line
            }
            this.titleHeight = titleHeight;
            legend.lastLineHeight = titleHeight + padding;
        } else {
            this.titleHeight = 19.5;
        }
    });
    H.wrap(H.Legend.prototype, 'render', function(proceed) {
        if ( typeof this.chart === 'undefined' ) {
            // this.chart is undefined if there has been a data error
            return;
        }
        var legend = this;
        legend.isFirstItem = true;
        var chart = legend.chart;
        var yAxis = legend.chart.yAxis;
        var oldLegendHeight = legend.legendHeight;
        proceed.apply(legend);
        var newLegendHeight = legend.legendHeight;

        // the overall height of the legend may fluctuate. We want the plot's height to shrink
        // to make room for the legend when the legend is too tall, but we don't want the plot's
        // height to always grow to fill the available space when the legend takes up less space
        // (such as when the user mouses out of the chart). This could lead to a plot constantly
        // changing height, which is rather annoying.
        // We only want to give the plot a chance to grow in height when the chart's width is
        // resized larger than it was previously, because this may cause the legend to use
        // fewer lines.

        // keep track of the maximum height that the legend achieves, and only reset this maximum
        // when the size of the plot grows.

        if ( chart.oldPlotWidth !== undefined && chart.plotWidth > chart.oldPlotWidth ) {
            legend.maxHeight = 0;
        }
        chart.oldPlotWidth = chart.plotWidth;

        // keep track of the maximum height that the legend achieves.
        var oldMaxHeight = legend.maxHeight === undefined ? 0 : legend.maxHeight;
        legend.maxHeight = Math.max( newLegendHeight, oldMaxHeight );

        // redraw the chart if the legend has gotten to a larger max height. This will shrink
        // the plot's height to make room for the legend.
        if ( oldLegendHeight && legend.maxHeight !== undefined && legend.maxHeight > oldMaxHeight ) {
            //for some reason we have to mark the y axis as dirty or it won't do anything
            //on a redraw
            yAxis[0].isDirty = true;
            chart.redraw();
        }

    });
    H.wrap(H.Legend.prototype, 'renderItem', function(proceed,item) {
        // modify how legend items are rendered to ensure that the timestamp will not
        // be rendered on top of the first legend item
        if ( item === undefined ) {
            return;
        } else {
            var legend = this;
            if ( legend.isFirstItem === undefined ) {
                legend.isFirstItem = true;
            }
            if ( legend.isFirstItem && item.legendItem !== undefined && item.legendItem !== null ) {
                var bbox = item.legendItem.getBBox();
                if ( legend.itemX + bbox.width + bbox.x > legend.chart.chartWidth - 2 * legend.padding ) {
                    // drop it down to the next row
                    legend.itemX = 0;
                    legend.itemY += legend.itemHeight;
                    legend.lastItemY = legend.itemY;
                    legend.lastLineHeight = 0;
                }
            }
            proceed.call( this, item );
        }
        legend.isFirstItem = false;
    });
}(Highcharts));
'use strict';

function plotFrame( $uibModal, $window, $timeout, $q, constants, latis, ChartData, EventsData, DatasetTypes, LoadingProgressTracker, Logger ) {
    return {
        restrict: 'A',
        templateUrl: 'plot_frame/plot_frame.html',
        scope: {
            initialMenuOptions: '= menuOptions',
            initialUiOptions: '=? uiOptions',
            datasets: '=?',
            data: '=?',
            initialTimeRange: '=? timeRange',
            chart: '=?',
            plotObj: '=?',
            plotList: '='
        },
        link: function( scope, element ) {
            var dataArray = [];
            var childScope;
            var cancelling = false;

            // menuOptions, uiOptions, and timeRange are initialized with default values and empty objects to ensure that we won't get an error when trying to access a property on a non-object

            // init menuOptions
            scope.menuOptions = angular.merge({
                dataDisplay: {
                    dataGrouping: constants.DEFAULT_DATA_GROUPING,
                    gaps: {
                        enabled: true,
                        threshold: 3
                    },
                    seriesDisplayMode: 'lines',
                    showMinMax: true
                },
                timeLabels: {},
                view: {
                    scrollbar: false,
                    events: false
                },
                yAxis: {
                    labels: {},
                    scaling: {},
                    scaleType: 'linear'
                },
                selectedXAxisIndex: 0,
                zoomMode: 'x'
            }, scope.initialMenuOptions );

            // eventsData holds data on the spacecraft events that occurred over the defined time period,
            // as well as metadata on different types of events.
            // This information is loaded at the same time as the telemetry items, or later if events are
            // toggled on after other data is loaded.
            scope.eventsData = undefined;

            // init uiOptions
            scope.uiOptions = angular.merge({
                disableMenuLabelText: 'Disable menu',
                plotHeight: constants.DEFAULT_PLOT_HEIGHT,
                colorTheme: constants.DEFAULT_COLOR_THEME,
                legendAlign: 'left',
                eventsURL: undefined
            }, scope.initialUiOptions );

            // init timeRange object
            // setting total.start or total.end to null instructs the chart to put no constraint on the minimum/maximum time as loaded from the server
            scope.timeRange = angular.merge({
                total: {
                    start: null,
                    end: null,
                    ertStart: null,
                    ertEnd: null
                },
                visible: {
                    start: null,
                    end: null
                }
            }, scope.initialTimeRange );
            sanitizeTimeRange();

            // init scope.datasets
            /* scope.datasets is an array of objects.
             * Each object looks like:
             * {
             *   accessURL: <string>,
             *   name: <string>,
             *   desc: <string>,
             *   offset: <number> or <string>,
             *   filters: {
             *       minmax: {
             *           enabled: <boolean>,
             *           min: <number>,
             *           max: <number>
             *       },
             *       delta: {
             *           enabled: <boolean>,
             *           value: <number>
             *       },
             *       change: {
             *           enabled: <boolean>
             *       }
             *   }
             * }
             */

            if ( typeof scope.datasets === 'undefined' ) {
                scope.datasets = [];
            }

            fixDatasetsObject();

            // scope.timeRange can contain null values, and we want to retain those values even after data has loaded.
            // In those cases, we still need a way to keep track of the loaded/visible range, as defined by the data returned from the server.
            // This variable updates whenever scope.timeRange updates.
            var actualTimeRange;
            setActualTimeRange();

            // init variables
            scope.constants = constants; // make it available to the template
            scope.plotObj = scope;
            scope.eventTableScope;
            scope.highchartScope;
            scope.chart = false;

            scope.history = [];

            scope.showBottomMenu = false;
            function closeDropdownMenus() {
                scope.plotMenuOpen = false;
                scope.zoomMenuOpen = false;
                scope.filterMenuOpen = false;
                scope.downloadMenuOpen = false;
            };
            closeDropdownMenus();

            scope.datasetType;
            scope.DatasetTypes = DatasetTypes; // to let the template access DatasetTypes
            scope.discreteFormattersEnabled = true;

            scope.loading = false;
            scope.loadingProgress = {
                kb: 0,
                percent: 0
            };

            var loadingProgressTrackers = [];

            scope.yellowViolations = undefined;
            scope.redViolations = undefined;

            scope.frameContentStyle = {
                height: scope.uiOptions.plotHeight + 'px'
            };

            scope.getElement = function() {
                return element;
            };

            function fixDatasetsObject() {
                // add an offset and filters object to each dataset if it doesn't have one
                scope.datasets = scope.datasets.map( function(ds) {
                    if ( typeof ds.offset === 'undefined' ) {
                        ds.offset = 0;
                    }
                    if ( typeof ds.filters === 'undefined' ) {
                        ds.filters = {};
                    }
                    if ( typeof ds.filters.minmax === 'undefined' ) {
                        ds.filters.minmax = {};
                    }
                    if ( typeof ds.filters.delta === 'undefined' ) {
                        ds.filters.delta = {};
                    }
                    if ( typeof ds.filters.change === 'undefined' ) {
                        ds.filters.change = {};
                    }
                    return ds;
                });

                // if there's only one dataset and it has an offset, normalize the offset to 0 and adjust the timerange
                if ( scope.datasets.length === 1 ) {
                    var offset = ChartData.parseOffset( scope.datasets[0].offset );
                    if ( offset !== 0 ) {
                        scope.datasets[0].offset = 0;
                        if ( scope.timeRange.total.start ) {
                            scope.timeRange.total.start = new Date( scope.timeRange.total.start.getTime() + offset );
                        }
                        if ( scope.timeRange.total.end ) {
                            scope.timeRange.total.end = new Date( scope.timeRange.total.end.getTime() + offset );
                        }
                        if ( scope.timeRange.visible.start ) {
                            scope.timeRange.visible.start = new Date( scope.timeRange.visible.start.getTime() + offset );
                        }
                        if ( scope.timeRange.visible.end ) {
                            scope.timeRange.visible.end = new Date( scope.timeRange.visible.end.getTime() + offset );
                        }
                    }
                }
            }

            // Returns whether the plot can combine with the given plot
            scope.canCombine = function( plot ) {
                try {
                    if (plot.plotObj !== scope.plotObj && plot.plotObj.datasetType === scope.datasetType) {
                        if (plot.plotObj.metadata[0].IndependentVariable.Units) {
                            if (plot.plotObj.metadata[0].IndependentVariable.Units === scope.metadata[0].IndependentVariable.Units) {
                                return true;
                            }
                        } else { // Check the variable name only if the variable units aren't set
                            if (plot.plotObj.metadata[0].IndependentVariable.Name &&
                                plot.plotObj.metadata[0].IndependentVariable.Name === scope.metadata[0].IndependentVariable.Name) {
                                return true;
                            }
                        }
                    }
                } catch (e) {
                    if (e instanceof TypeError) {
                        return false;
                    }
                }

                return false;
            };

            scope.isOverplot = function() {
                return scope.datasets.length > 1;
            };

            scope.hasOffsetDatasets = function() {
                return scope.datasets.some( function(ds) {
                    return ChartData.parseOffset( ds.offset ) !== 0;
                });
            };

            var closeDropdownMenusOnClick = function( $event ) {
                var clickedOnPlot = elementIsChildOf( angular.element($event.target), element );

                var apply = false;
                if ( scope.plotMenuOpen && (!clickedOnPlot || !$event.clickedPlotMenu) ) {
                    scope.plotMenuOpen = false;
                    apply = true;
                }

                if ( scope.filterMenuOpen && (!clickedOnPlot || !$event.clickedFilterMenu) ) {
                    scope.filterMenuOpen = false;
                    apply = true;
                }

                if ( scope.downloadMenuOpen && (!clickedOnPlot || !$event.clickedDownloadMenu) ) {
                    scope.downloadMenuOpen = false;
                    apply = true;
                }

                if ( scope.zoomMenuOpen && (!clickedOnPlot || !$event.clickedZoomMenu) ) {
                    scope.zoomMenuOpen = false;
                    apply = true;
                }

                if ( apply ) {
                    scope.$apply();
                }
            };

            // takes two jqlite objects, and returns true if element1 is a child of element2,
            // or if element1 is element2
            function elementIsChildOf( element1, element2 ) {
                var currentElement = element1;
                while( currentElement.length > 0 ) {
                    if ( currentElement[0] === element2[0] ) {
                        return true;
                    }
                    currentElement = currentElement.parent();
                }
                return false;
            }

            $window.addEventListener( 'click', closeDropdownMenusOnClick );

            scope.increaseResolutionButtonIsEnabled = function() {
                return !scope.uiOptions.collapsed && !scope.fullResolution && !scope.dataError && !scope.loading && !scope.visibleTimeRangeMatchesTotal() && scope.datasetType != DatasetTypes.DISCRETE && scope.dataExistsInCurrentRange;
            };

            scope.togglePlotMenu = function($event) {
                $event.clickedPlotMenu = true;
                scope.plotMenuOpen = !scope.plotMenuOpen;
                scope.plotMenuBtn = $event.target;
            };

            scope.toggleZoomMenu = function($event) {
                $event.clickedZoomMenu = true;
                scope.zoomMenuOpen = !scope.zoomMenuOpen;
            };

            scope.toggleFilterMenu = function($event) {
                $event.clickedFilterMenu = true;
                scope.filterMenuOpen = !scope.filterMenuOpen;
            };

            scope.toggleDownloadMenu = function($event) {
                $event.clickedDownloadMenu = true;
                scope.downloadMenuOpen = !scope.downloadMenuOpen;
            };

            scope.downloadButtonEnabled = function() {
                if ( typeof scope.noDataErrorKeys === 'undefined' || typeof scope.datasets === 'undefined' ) {
                    return false;
                }
                else return constants.EXPORTING && !scope.loading && scope.noDataErrorKeys.length < scope.datasets.length;
            };

            // scope.filterSelection tracks the filter button dropdown, which sets the same
            // filters across all datasets
            scope.filterSelection = {
                minmax: {
                    enabled: false,
                    min: null,
                    max: null
                },
                delta: {
                    enabled: false,
                    value: null
                },
                change: {
                    enabled: false
                }
            };

            scope.filtersAreActive = function() {
                // search through all the filters of each dataset, to see if any are enabled
                return scope.datasets.some( function(ds) {
                    return ds.filters.minmax.enabled || ds.filters.delta.enabled || ds.filters.change.enabled;
                });
            };

            // add / change filters for all datasets.
            scope.applyFilters = function() {
                scope.filterError = '';
                // check for errors before altering filter settings for datasets
                if ( scope.filterSelection.minmax.enabled ) {
                    var min = scope.filterSelection.minmax.min;
                    var max = scope.filterSelection.minmax.max;
                    if ( Number(min) !== min || isNaN(min) ) {
                        scope.filterError = "Min value must be a number";
                        return;
                    } else if ( Number(max) !== max || isNaN(max) ) {
                        scope.filterError = "Max value must be a number";
                        return;
                    } else if ( min >= max ) {
                        scope.filterError = "Min value must be less than max";
                        return;
                    }

                }

                if ( scope.filterSelection.delta.enabled ) {
                    var value = scope.filterSelection.delta.value;
                    if ( Number(value) !== value || isNaN(value) ) {
                        scope.filterError = "Delta max change must be a number";
                        return;
                    } else if ( value <= 0 ) {
                        scope.filterError = "Delta max change must be greater than 0";
                        return;
                    }

                }

                // apply the changes to all datasets
                scope.datasets.forEach( function(ds) {
                    ds.filters = angular.copy( scope.filterSelection );
                });

                // close the filter menu
                scope.filterMenuOpen = false;
            };

            // get the query used in the URL to tell latis to filter the data
            scope.getFilterQuery = function( dataset ) {
                var query = '';
                if ( scope.datasetType === DatasetTypes.ANALOG ) {
                    // minmax filter
                    if ( dataset.filters.minmax.enabled ) {
                        if ( typeof dataset.filters.minmax.min === 'number' ) {
                            query += '&value>' + dataset.filters.minmax.min;
                        }
                        if ( typeof dataset.filters.minmax.max === 'number' ) {
                            query += '&value<' + dataset.filters.minmax.max;
                        }
                    }

                    // delta filter
                    if ( dataset.filters.delta.enabled && typeof dataset.filters.delta.value === 'number' ) {
                        query += '&maxDelta(value,' + dataset.filters.delta.value + ')';
                    }
                }

                // change filter
                if ( dataset.filters.change.enabled ) {
                    query += '&thin()';
                }
                return query;
            };

            /**
             * @ngdoc method
             * @name setTimeRange
             * @methodOf plotFrame
             * @description
             * Sets a new total and/or visible time range for the plot. If needed, the plot will download new data.
             * Adds the old timeRange state to the history stack by default.
             *
             * @param {TimeRange} newTimeRange The new total and visible time range the plot should display. If any of the values in newTimeRange are undefined, the plot's respective values will remain the same.
             * @param {boolean} [addToHistory=true] Whether to add the plot's current time range state to the history stack.
             * @example
             * scope.setTimeRange({
             *     total: {
             *         start: new Date('Feb 20, 2000 00:00:00'),
             *         end: new Date('Feb 21, 2000 00:00:00')
             *     },
             *     visible: {
             *         start: new Date('Feb 20, 2000 12:00:00'),
             *         end: undefined
             *     }
             * }, true );
             */
            scope.setTimeRange = function( newTimeRange, addToHistory ) {
                if ( typeof addToHistory === 'undefined' ) {
                    addToHistory = true;
                }

                var oldTimeRange = angular.copy(scope.timeRange);

                // overwrite the current time range with the passed values
                // using angular.merge ensures that we won't set any values to undefined
                angular.merge( scope.timeRange, newTimeRange );

                sanitizeTimeRange();

                setActualTimeRange();

                if ( angular.equals(scope.timeRange, oldTimeRange ) ) {
                    return; // no changes made, so nothing needs to be done.
                }

                if ( addToHistory ) {
                    // Add the previous state to history
                    scope.history.push( oldTimeRange );
                    scope.$emit( 'historyAdded', scope.history );
                }

                // if the total time range has changed, load new data
                if ( !angular.equals(scope.timeRange.total, oldTimeRange.total) ) {
                    scope.downloadAllDatasets();
                } else if ( !angular.equals(scope.timeRange.visible, oldTimeRange.visible) ) {
                    // if the visible time range has changed, apply it
                    // only execute this block if the total time range didn't change, because if both total and visible time ranges changed,
                    // the code for the child scope will apply the visible range when the new data has loaded.
                    childScope.applyVisibleTimeRange();
                }
            };

            /**
             * @ngdoc method
             * @name getTimeRange
             * @methodOf plotFrame
             * @description
             * Returns the plot's current total and visible time range.
             *
             * @returns {Object} The plot's time range.
             */
            scope.getTimeRange = function() {
                // Rather than returning scope.timeRange, return actualTimeRange so that we can avoid returning nulls if possible
                return angular.copy( actualTimeRange );
            };

            /**
             * @ngdoc method
             * @name openTimeRangeModal
             * @methodOf plotFrame
             * @description
             * Opens a modal to select a new total time range.
             *
             * @returns {Object} The plot's time range.
             */
            scope.openTimeRangeModal = function() {
                scope.modalInstance = $uibModal.open({
                    templateUrl: 'timerange_modal/timerange_modal.html',
                    controller: 'timeRangeModalCtrl',
                    size: 'lg',
                    resolve: {
                        data: function () {
                            return {
                                timeRange: scope.getTimeRange(),
                                menuOptions: scope.getMenuOptions(),
                                hasOffsetDatasets: scope.hasOffsetDatasets()
                            };
                        }
                    }
                });

                scope.modalInstance.result.then( function(data) {
                    // apply the time range and format set in the modal
                    scope.setMenuOptions({
                        timeLabels: {
                            momentTimeFormat: data.timeFormat
                        }
                    });

                    scope.setTimeRange({
                        total: {
                            start: data.date.start,
                            end: data.date.end
                        },
                        visible: {
                            start: data.date.start.getTime(),
                            end: data.date.end.getTime()
                        }
                    });
                });
            };

            /**
             * @ngdoc method
             * @name visibleTimeRangeMatchesTotal
             * @methodOf plotFrame
             * @description
             * Determines whether the currently visible time range is the same as the total loaded time range.
             *
             * @returns {boolean} Whether visible and total time ranges are the same.
             */
            scope.visibleTimeRangeMatchesTotal = function() {
                if ( actualTimeRange.total.start === null || actualTimeRange.total.end === null ) return true;
                return actualTimeRange.visible.start.getTime() === actualTimeRange.total.start.getTime()
                    && actualTimeRange.visible.end.getTime()   === actualTimeRange.total.end.getTime();
            };


            /**
             * @ngdoc method
             * @name increaseResolution
             * @methodOf plotFrame
             * @description
             * Sets the total time range to match the currently visible time range and loads new data.
             * Assuming that the server doesn't always return the full resolution data, this effectively increases the resolution of the loaded data.
             */
            scope.increaseResolution = function() {
                scope.setTimeRange({
                    total: {
                        start: new Date( actualTimeRange.visible.start ),
                        end: new Date( actualTimeRange.visible.end )
                    }
                });
            };

            /**
             * @ngdoc method
             * @name resetZoom
             * @methodOf plotFrame
             * @description
             * Sets the visible time range to match the current total time range.
             */
            scope.resetZoom = function() {
                if ( childScope.resetYZoom ) childScope.resetYZoom();
                scope.setTimeRange({
                    visible: {
                        start: new Date( actualTimeRange.total.start ),
                        end: new Date( actualTimeRange.total.end )
                    }
                });
            };

            /**
             * @ngdoc method
             * @name undoZoom
             * @methodOf plotFrame
             * @description
             * Undoes the last time range change performed on the plot.
             */
            scope.undoZoom = function() {
                if ( scope.history.length > 0 ) {
                    scope.setTimeRange( scope.history.pop(), false );
                }
            };

            /**
             * @ngdoc method
             * @name setTimeRangeByDuration
             * @methodOf plotFrame
             * @description
             * Sets a new time range (both total and visible time ranges) based on a duration of time, with the center point of the currently visible time range at the center of the new time range.
             *
             * @param {Number} duration The duration of the new time range, in milliseconds.
             */
            scope.setTimeRangeByDuration = function( duration ) {
                var currentRange = actualTimeRange.visible.end.getTime() - actualTimeRange.visible.start.getTime();
                var center = currentRange/2 + actualTimeRange.visible.start.getTime();

                // set the new range based on the old center point and the new duration
                var start = center - duration/2;
                var end = center + duration/2;

                if ( duration > constants.MINIMUM_RANGE && start < end ) { //define a minimum range
                    scope.setTimeRange({
                        total: {
                            start: new Date(start),
                            end: new Date(end)
                        },
                        visible: {
                            start: new Date(start),
                            end: new Date(end)
                        }
                    });
                }
            };

            /**
             * @ngdoc method
             * @name zoom
             * @methodOf plotFrame
             * @description
             * Zooms in or out relative to the current visible time range, setting a new time range (both total and visible time ranges).
             * If `ratio > 1`, the new time range will be longer than the current time range, effectively zooming out.
             * If `ratio < 1`, the new time range will be shorter than the current time range, effectively zooming in.
             *
             * @param {Number} ratio The ratio of the duration of the new range to the duration of the current visible time range.
             */
            scope.zoom = function( ratio ) {
                scope.setTimeRangeByDuration( (actualTimeRange.visible.end.getTime() - actualTimeRange.visible.start.getTime()) * ratio );
            };

            /**
             * @ngdoc method
             * @name zoomOut
             * @methodOf plotFrame
             * @description
             * Zooms the plot by an amount defined by the constant `ZOOM_OUT_RATIO`.
             */
            scope.zoomOut = function() {
                scope.zoom( constants.ZOOM_OUT_RATIO );
            };

            /**
             * @ngdoc method
             * @name zoomIn
             * @methodOf plotFrame
             * @description
             * Zooms the plot by an amount defined by the constant `ZOOM_IN_RATIO`.
             */
            scope.zoomIn = function() {
                scope.zoom( constants.ZOOM_IN_RATIO );
            };

            /**
             * @ngdoc method
             * @name pan
             * @methodOf plotFrame
             * @description
             * Pans the plot by a defined ratio, relative to the current visible time range. Sets a new time range (both total and visible).
             * If `ratio < 0`, the plot will pan to the left.
             * If `ratio > 0`, the plot will pan to the right.
             * A value of 1 corresponds to the currently visible duration, so if `ratio = 1`, the plot will pan one "screen" to the right, i.e.
             * the new start date will be equal to the old end date.
             *
             * @param {Number} ratio The ratio representing how far to pan. Mathematically, the ratio represents `(newStart - oldStart) / (oldEnd - oldStart)`
             */
            scope.pan = function( ratio ) {
                var currentDuration = actualTimeRange.visible.end.getTime() - actualTimeRange.visible.start.getTime();
                var newStartTime = ratio * currentDuration + actualTimeRange.visible.start.getTime();
                scope.setTimeRange({
                    total: {
                        start: new Date( newStartTime ),
                        end: new Date( newStartTime + currentDuration )
                    },
                    visible: {
                        start: new Date( newStartTime ),
                        end: new Date( newStartTime + currentDuration )
                    }
                });
            };

            /**
             * @ngdoc method
             * @name panLeft
             * @methodOf plotFrame
             * @description
             * Pans the plot by an amount defined by the constant `PAN_LEFT_RATIO`.
             */
            scope.panLeft = function() {
                scope.pan( constants.PAN_LEFT_RATIO );
            };

            /**
             * @ngdoc method
             * @name panLeft
             * @methodOf plotFrame
             * @description
             * Pans the plot by an amount defined by the constant `PAN_RIGHT_RATIO`.
             */
            scope.panRight = function() {
                scope.pan( constants.PAN_RIGHT_RATIO );
            };

            /**
             * @ngdoc method
             * @name setMenuOptions
             * @methodOf plotFrame
             * @description
             * Applies one or more new menu options.
             *
             * @param {Object} options The new options to set. The passed object should have the same structure as menuOptions.
             * @example
             * scope.setMenuOptions({
             *     view: {
             *         limits: true
             *     },
             *     zoomMode: 'xy'
             * });
             */
            scope.setMenuOptions = function( options ) {
                // Before we update the menuOptions object, make a copy of its current state for comparison.
                // We'll only want to execute code if properties have actually changed
                var oldOptions = angular.copy( scope.menuOptions );
                angular.merge( scope.menuOptions, options );
                // angular.merge treats arrays like merge-able objects...
                // {a: [5,6]} merged into {a: [1,2,3]} will result in {a: [5,6,3]}
                // but we want to replace some array values, not "merge" them.
                if ( options.view !== undefined && options.view.eventTypes !== undefined ) {
                    scope.menuOptions.view.eventTypes = angular.copy(options.view.eventTypes);
                }

                // make sure some menu controls reflect the state of menuOptions
                setMenuControls();

                // emit an event if the options menu has been disabled
                if ( scope.menuOptions.menuDisabled && !oldOptions.menuDisabled ) {
                    scope.$emit( 'menuDisabled' );
                }

                if ( scope.menuOptions.view.events && !oldOptions.view.events ) {
                    // this will reset the chart and get/remove event data
                    scope.downloadAllDatasets();
                    return;
                }

                // pass the info down to the child scope so it can act as necessary
                if ( childScope ) {
                    childScope.onSetMenuOptions( oldOptions );
                }
            };

            /**
             * @ngdoc method
             * @name getMenuOptions
             * @methodOf plotFrame
             * @description
             * Returns a copy of the plot's current menu options.
             */
            scope.getMenuOptions = function() {
                // return a copy of the menuOptions object, so the original object can only be changed via setMenuOptions
                return angular.copy( scope.menuOptions );
            };

            /**
             * @ngdoc method
             * @name setUiOptions
             * @methodOf plotFrame
             * @description
             * Applies one or more new UI options.
             *
             * @param {Object} options The new options to set. The passed object should have the same structure as uiOptions.
             * @example
             * scope.setUiOptions({
             *     collapsed: false,
             *     showResetZoomButton: true
             * });
             */
            scope.setUiOptions = function( options ) {
                var oldOptions = angular.copy( scope.uiOptions );
                angular.merge( scope.uiOptions, options );

                if ( scope.uiOptions.plotHeight !== oldOptions.plotHeight ) {
                    scope.frameContentStyle.height = scope.uiOptions.plotHeight + 'px';
                }

                if ( childScope ) {
                    childScope.onSetUiOptions( oldOptions );
                }
            };

            /**
             * @ngdoc method
             * @name getUiOptions
             * @methodOf plotFrame
             * @description
             * Returns a copy of the plot's current UI options.
             */
            scope.getUiOptions = function() {
                return angular.copy( scope.uiOptions );
            };

            function beforeSetData() {
                var deferred = $q.defer();

                scope.yellowViolations = 0;
                scope.redViolations = 0;
                scope.dataError = '';
                scope.dataErrorString = '';

                scope.noDataErrorKeys = [];
                scope.dataRequests = [];
                scope.metadata = [];
                dataArray = [];

                scope.setTitle();
                closeDropdownMenus();

                // use a brief timeout to let child scopes initialize before we continue
                scope.$applyAsync( function() {
                    setupChildScope();
                    deferred.resolve();
                });

                return deferred.promise;
            }

            function afterSetData() {
                // if scope.timeRange contains nulls, we need to find the actual time range as returned by the loaded data
                setActualTimeRange();
                childScope.afterAllDatasetsDownloaded();
            }

            scope.downloadAllDatasets = function() {
                if ( scope.datasets.length === 0 ) {
                    return;
                }

                // cancel old requests before making new ones
                if ( scope.dataRequests !== undefined && scope.dataRequests.length > 0 && scope.cancel !== undefined ) {
                    scope.cancel.promise.then( function() {
                        // mark each ChartData object as cancelled, so that
                        // it won't show an error message when the promise rejects
                        dataArray.forEach( function(chartData) {
                            chartData.cancelled = true;
                        });
                        continueDownloadingAllDatasets();
                    });
                    // cancel all current downloads by resolving the cancel promise
                    scope.cancel.resolve();
                } else {
                    continueDownloadingAllDatasets();
                }
            };

            function continueDownloadingAllDatasets() {
                scope.cancel = $q.defer();
                scope.loading = true;

                var accessURL = scope.datasets[0].accessURL;
                // determine what kind of plot this is
                // users aren't allowed to overlay multiple different kinds of datasets on one plot, so the plot type is determined by only one of the datasets
                if ( accessURL.indexOf('Discrete') !== -1 ) {
                    scope.datasetType = DatasetTypes.DISCRETE;
                } else if ( accessURL.indexOf('String') !== -1 ) {
                    scope.datasetType = DatasetTypes.EVENT_TABLE;
                } else {
                    scope.datasetType = DatasetTypes.ANALOG;
                }

                beforeSetData().then( function() {
                    resetLoadingProgress();
                    loadingProgressTrackers = [];

                    scope.datasets.forEach( downloadDataset );

                    // download events data too if needed
                    if ( scope.menuOptions.view.events && typeof scope.uiOptions.eventsURL !== 'undefined' ) {
                        downloadEventsData();
                    }

                    // success and failure handlers are the same since the difference in logic for these is handled elsewhere
                    $q.all( scope.dataRequests ).then( onAllDataRequests, onAllDataRequests );

                    function onAllDataRequests(chartData1) {
                        // if one of the chartData objects was cancelled, it means all of them were
                        if ( chartData1.cancelled ) {
                            return;
                        }

                        resetLoadingProgress();
                        loadingProgressTrackers = [];

                        afterSetData();
                        scope.loading = false;
                    }
                });
            };

            function resetLoadingProgress() {
                scope.loadingProgress.kb = 0;
                scope.loadingProgress.percent = 0;
            }

            function sanitizeTimeRange() {
                // convert numbers or datestrings to date objects if necessary. The total and visible ranges should be stored as Dates.
                var tr = scope.timeRange; // shorthand
                var oldTimeRange = angular.copy( tr );
                if ( typeof tr.total.start === 'number' || typeof tr.total.start === 'string' ) tr.total.start = new Date( tr.total.start );
                if ( typeof tr.total.end === 'number' || typeof tr.total.end === 'string' ) tr.total.end = new Date( tr.total.end );
                if ( typeof tr.visible.start === 'number' || typeof tr.visible.start === 'string' ) tr.visible.start = new Date( tr.visible.start );
                if ( typeof tr.visible.end   === 'number' || typeof tr.visible.end === 'string' ) tr.visible.end = new Date( tr.visible.end );

                if ( !angular.equals(oldTimeRange, tr) ) {
                    console.warn( 'Lasp-highstock deprecation notice: timeRange values should be Date objects.', oldTimeRange );
                }
            }

            function setActualTimeRange() {
                actualTimeRange = angular.copy( scope.timeRange );

                if ( dataArray.length > 0 ) {
                    // find the overall time range given by all the data
                    var dataTimeRange = dataArray.reduce( function(computedTimeRange, data) {
                        var range = data.getXRange();
                        if ( range ) {
                            return {
                                start: Math.min( computedTimeRange.start, range.start ),
                                end: Math.max( computedTimeRange.end, range.end )
                            };
                        } else {
                            return computedTimeRange;
                        }

                    }, {
                        start: Infinity,
                        end: -Infinity
                    });

                    // we can only compute total time range if we have data
                    if ( actualTimeRange.total.start === null ) {
                        actualTimeRange.total.start = new Date( dataTimeRange.start );
                    }
                    if ( actualTimeRange.total.end === null ) {
                        actualTimeRange.total.end = new Date( dataTimeRange.end );
                    }
                }

                // if the visible range has nulls, set the value to whatever is defined in the total range
                if ( actualTimeRange.visible.start === null && actualTimeRange.total.start !== null ) {
                    actualTimeRange.visible.start = new Date( actualTimeRange.total.start );
                }
                if ( actualTimeRange.visible.end === null && actualTimeRange.total.end !== null ) {
                    actualTimeRange.visible.end = new Date( actualTimeRange.total.end );
                }
            }

            function updateMainLoadingProgress() {
                // Loop through all loading progress trackers. Average the percents and total the kb's
                resetLoadingProgress();
                loadingProgressTrackers.forEach( function(tracker) {
                    scope.loadingProgress.kb += tracker.kb;
                    // if any of the trackers report a null percent, then any guess we make on overall percent across all
                    // datasets will be inaccurate, so set the overall percent to null
                    scope.loadingProgress.percent = ( scope.loadingProgress.percent === null || tracker.percent === null )
                        ? null
                        : scope.loadingProgress.percent + tracker.percent;
                });

                if ( scope.loadingProgress.percent === null ) {
                    // Progress percent is not calculable. Show 100% so that there's at least a loading graphic to look at.
                    scope.loadingProgress.percent = 100;
                } else {
                    // average the percent
                    scope.loadingProgress.percent /= loadingProgressTrackers.length;
                }
            }

            var downloadEventsData = function() {
                var eventsAccessURL = scope.uiOptions.eventsURL;
                var requestStartTime, requestEndTime;
                // if the URL doesn't have a "?" in it, add it now so we can append GET parameters
                if ( eventsAccessURL.indexOf('?') === -1 ) {
                    eventsAccessURL += '?';
                }
                //add start and stop times if available
                if ( scope.timeRange.total.start !== null && scope.timeRange.total.end !== null ) {
                    // save the start/end time values for use in the progress event handler
                    requestStartTime = scope.timeRange.total.start.getTime();
                    requestEndTime = scope.timeRange.total.end.getTime();
                    if ( !isNaN(requestStartTime) && !isNaN(requestEndTime) ) {
                        eventsAccessURL += '&time>=' + scope.timeRange.total.start.toISOString() + '&time<=' + scope.timeRange.total.end.toISOString();
                    }
                }
                // set up an object to track progress of the download
                var tracker = new LoadingProgressTracker( requestStartTime, requestEndTime, updateMainLoadingProgress, LoadingProgressTracker.dataTypes.events );
                loadingProgressTrackers.push( tracker );

                scope.eventsData = new EventsData();
                var eventsPromise = scope.eventsData.downloadData( eventsAccessURL, scope.cancel, tracker.onProgress );
                scope.dataRequests.push( eventsPromise );
                eventsPromise.then( function() {
                    // if menuOptions.view.eventTypes isn't set, set it now to display all event types
                    if ( scope.menuOptions.view.eventTypes === undefined ) {
                        scope.menuOptions.view.eventTypes = scope.eventsData.types.map( function(type) {
                            return type.id;
                        });
                    }
                });
            };

            var downloadDataset = function( dataset ) {
                //create accessURLs
                var accessURL = dataset.accessURL;
                var requestStartTime, requestEndTime;
                var dateRange = scope.timeRange.total;
                //add ERT if available
                if( dateRange.ertStart !== null && dateRange.ertEnd !== null ) {
                    accessURL += '&ERT>=' + dateRange.ertStart + '&ERT<=' + dateRange.ertEnd;
                }

                //add filters if enabled
                accessURL += scope.getFilterQuery( dataset );

                //add start and stop times if available
                if ( dateRange.start !== null && dateRange.end !== null ) {
                    // account for a time offset
                    var offsetMs = ChartData.parseOffset( dataset.offset );
                    var adjustedDate = {
                        start: new Date( dateRange.start.getTime() + offsetMs ),
                        end:   new Date( dateRange.end.getTime() + offsetMs )
                    };
                    // save the start/end time values for use in the progress event handler
                    requestStartTime = adjustedDate.start.getTime();
                    requestEndTime = adjustedDate.end.getTime();
                    if ( !isNaN(requestStartTime) && !isNaN(requestEndTime) ) {
                        accessURL += '&time>=' + adjustedDate.start.toISOString() + '&time<=' + adjustedDate.end.toISOString();
                    }
                }

                // append extra options to the accessURL if applicable
                if ( typeof childScope.getExtraAccessURLParameters !== 'undefined' ) {
                    accessURL += childScope.getExtraAccessURLParameters();
                }

                // set up an object to track progress of the download
                var tracker = new LoadingProgressTracker( requestStartTime, requestEndTime, updateMainLoadingProgress );
                loadingProgressTrackers.push( tracker );

                dataArray.push( new ChartData() );
                var data = dataArray[dataArray.length-1];

                scope.dataRequests.push( data.downloadData( accessURL, scope.cancel, tracker.onProgress, dataset.indexes, dataset.offset ) );
                scope.dataRequests[ scope.dataRequests.length - 1 ].then( function() {
                    //check to see if we have non-zero data
                    if ( data.getData().length === 0 ) {
                        if ( scope.noDataErrorKeys.indexOf( data.getYName() ) === -1 ) {
                            scope.noDataErrorKeys.push( data.getYName() );
                        }

                        if ( scope.noDataErrorKeys.length > 0 ){
                            // build an error message to show
                            scope.dataErrorString = 'No data found for the given time range for the following dataset';
                            if ( scope.noDataErrorKeys.length !== 1 ) {
                                scope.dataErrorString += 's';
                            }
                            scope.dataErrorString += ': ' + scope.noDataErrorKeys.join(', ') + '.';
                        } else {
                            scope.dataErrorString = 'Unknown error getting data.';
                        }

                        scope.dataError = 'noData';
                    }

                    //make sure we don't add the same metadata twice
                    var nameExists = false;
                    for ( var i = 0; i < scope.metadata.length; i++ ) {
                        if ( scope.metadata[i] === undefined ) {
                            continue;
                        }
                        if ( scope.metadata[i].Name === data.getMetadata().Name ) {
                            nameExists = true;
                        }
                    }
                    if ( !nameExists ) {
                        // add this metadata to the metadata array, at an index number that matches the order in which we made the GET requests.
                        scope.metadata[ dataArray.indexOf(data) ] =  data.getMetadata();
                    }

                    scope.fullResolution = data.checkFullResolution();
                    data.checkLimitViolations();
                    scope.yellowViolations += data.numViolations.yellow;
                    scope.redViolations += data.numViolations.red;

                    childScope.afterDatasetDownloaded( data );
                }, function(chartData) {
                    // emit an event with the details of the failure, but not if we're cancelling it
                    // We're only interested in notifying the app of http failures that the user didn't cause
                    if ( !chartData.cancelled && !cancelling ) {
                        // add this dataset to the list of ones with no data
                        if ( scope.noDataErrorKeys.indexOf( dataset.name ) === -1 ) {
                            scope.noDataErrorKeys.push( dataset.name );
                        }

                        var error = data.getError();
                        // show error message
                        scope.dataError = 'Server Error';
                        scope.desc = error.code;
                        scope.dataErrorString = error.message;

                        scope.$emit( 'httpError', error.status );
                    }
                });

            };

            var setupChildScope = function() {
                // figure out whether we are displaying an event table or a chart
                childScope = scope.datasetType === DatasetTypes.EVENT_TABLE ? scope.eventTableScope : scope.highchartScope;
                // pass some often-used variables to the child scope
                childScope.menuOptions = scope.menuOptions;
                childScope.timeRange = scope.timeRange;
                childScope.uiOptions = scope.uiOptions;
                childScope.datasets = scope.datasets;
                childScope.data = scope.data;
                childScope.setDataArray( dataArray );

                childScope.init();
            };

            scope.openInfoModal = function() {
                scope.modalInstance = $uibModal.open({
                    templateUrl: 'metadata_modal/metadata_modal.html',
                    controller: 'dialogCtrl',
                    size: 'md',
                    resolve: {
                        data: function () {
                            return scope.metadata;
                        }
                    }
                });
            };

            scope.setTitle = function() {
                scope.name = '';
                scope.desc = '';
                for ( var i = 0; i < scope.datasets.length; i++ ) {
                    var ds = scope.datasets[i];
                    scope.name += ds.name;
                    scope.desc += ds.desc;
                    if ( i !== scope.datasets.length - 1 ) {
                       scope.name += ' / ';
                       scope.desc += ' / ';
                   }
                }
            };

            scope.onChangeDatasetsClicked = function() {
                closeDropdownMenus();
                scope.$emit( 'changeDatasetsClicked' );
            };

            scope.showChangeDatasetsMenuItem = function() {
                // look through the hierarchy of parents to see if any of them are listening for this event
                // Only show the button if there's a listener
                var currentScope = scope;
                do {
                    if ( typeof currentScope.$$listeners.changeDatasetsClicked !== 'undefined' ) {
                        // found a listener. Show the button.
                        return true;
                    }
                    currentScope = currentScope.$parent;
                } while ( currentScope );

                // no listener found.
                return false;
            };

            /**
             * @ngdoc method
             * @name removeDatasets
             * @methodOf plotFrame
             * @description
             * Removes one or more datasets from the plot.
             *
             * @param {array} datasetKeysToRemove An array of dataset names to remove. A dataset name is the value of the property `dataset.name`.
             * @example
             * scope.removeDatasets(['ADGYT1', 'ADST1CCNT']);
             */
            scope.removeDatasets = function( datasetKeysToRemove ) {
                // filter out the datasets which are included in datasetKeysToRemove
                scope.datasets = scope.datasets.filter( function( dataset ) {
                    return datasetKeysToRemove.indexOf( dataset.name ) === -1;
                });
                if ( scope.datasets.length === 0 ) {
                    scope.removePlot();
                }
            };

            scope.datasetIsEmpty = function( dataset ) {
                // the function takes either a name of a dataset, or a dataset object
                var datasetName = typeof dataset === 'string' ? dataset : dataset.name;
                return scope.noDataErrorKeys.indexOf( datasetName ) !== -1;
            };

            /**
             * @ngdoc method
             * @name splitDatasets
             * @methodOf plotFrame
             * @description
             * Splits one or more datasets into separate plots
             *
             * @param {array} datasetKeys An array of dataset names to split. A dataset name is the value of the property `dataset.name`.
             *   If undefiend, all datasets will be split into new plots.
             * @example
             * scope.splitDatasets(['ADGYT1', 'ADST1CCNT']);
             * scope.splitDatasets();
             */
            scope.splitDatasets = function( datasetKeys ) {
                // make a new array of plots made from individual datasets of the current plot
                var newPlots = [];
                for ( var i = 0; i < scope.datasets.length; i++ ) {
                    if ( typeof datasetKeys === 'undefined' || datasetKeys.indexOf(scope.datasets[i].name) !== -1 ) {
                        // isolate only one of the datasets
                        newPlots.push({
                            datasets: scope.datasets.splice( i, 1 ),
                            timeRange: angular.copy( scope.timeRange ),
                            menuOptions: angular.copy( scope.menuOptions ),
                            uiOptions: angular.copy( scope.uiOptions ),
                            plotObj: undefined,
                            chart: []
                        });
                        // correct the index value since we sliced the datasets array
                        i--;
                    }
                }

                // get array index of current plot
                var index;
                for ( i = 0; i < scope.plotList.length; i++ ) {
                    if ( scope.plotList[i].plotObj === scope ) {
                        index = i;
                        break;
                    }
                }

                // add the new plots to the list and remove this one
                // use splice rather than push so we can keep the order of plots as expected
                scope.plotList.splice.apply( scope.plotList, new Array( index+1, 0 ).concat( newPlots ) );

                if ( scope.datasets.length === 0 ) {
                    scope.removePlot();
                }
            };

            scope.absorbDatasetsOf = function( plotToAbsorb ) {
                // add the specified plot's datasets to this one
                for ( var i = 0; i < plotToAbsorb.datasets.length; i++ ) {
                    scope.datasets.push( plotToAbsorb.datasets[i] );
                }
                // kill the absorbed plot
                plotToAbsorb.plotObj.removePlot();
            };

            /**
             * @ngdoc method
             * @name downloadCSV
             * @methodOf plotFrame
             * @description
             * Download CSV data files given a plot object. If the plot has overplotted items, it opens a modal so the user can choose which items to download data for.
             */
            scope.downloadCSV = function() {
                // Chrome can't handle multiple download requests at once, so show a modal if there are multiple overplotted datasets
                if ( scope.datasets.length === 1 ) {
                    scope.downloadCSVforDatasets( 0 );
                } else {
                    // pop open a modal with download buttons
                    scope.modalInstance = $uibModal.open({
                        templateUrl: 'download_modal/download_modal.html',
                        controller: 'downloadCtrl',
                        size: 'md',
                        resolve: {
                            data: function() {
                                return {
                                    datasets: scope.datasets,
                                    downloadFunc: scope.downloadCSVforDatasets,
                                    datasetIsEmpty: scope.datasetIsEmpty
                                }
                            }
                        }
                    });
                }
            };

            /**
             * @ngdoc method
             * @name downloadImage
             * @methodOf plotFrame
             * @description
             * Download image of the plot.
             *
             * @param {string} filetype Filetype of the image. Accepts either 'png' or 'svg'.
             */
            scope.downloadImage = function( filetype ) {
                if ( scope.datasetType !== DatasetTypes.ANALOG && scope.datasetType !== DatasetTypes.DISCRETE ) {
                    console.error( 'Programmer error: downloadImage expected only for analog and discrete data' );
                }
                if ( filetype !== 'png' && filetype !== 'svg' && filetype !== 'pdf' ) {
                    console.error( 'Programmer error: only png, svg, and pdf are expected for downloadImage' );
                }
                // let the child scope handle the downloading of the image, since the specifics may vary based on what plot type this is
                // as of this comment, only a highcharts plot should handle this, but we may add more plot types that can generate image files
                childScope.downloadImage( filetype, scope.name );
            };

            /**
             * @ngdoc method
             * @name getDefaultYAxisLabelWidth
             * @methodOf plotFrame
             * @description
             * Get the pixel width of the y-axis label area. For plots which don't have a y-axis label area (like en Event Table), this returns 0.
             */
            scope.getDefaultYAxisLabelWidth = function() {
                if ( typeof childScope !== 'undefined' && typeof childScope.getDefaultYAxisLabelWidth !== 'undefined' ) {
                    return childScope.getDefaultYAxisLabelWidth();
                } else {
                    return 0;
                }
            };

            /**
             * @ngdoc method
             * @name setYAxisLabelWidth
             * @methodOf plotFrame
             * @description
             * For timeseries plots, sets the width of the y-axis label area.
             */
            scope.setYAxisLabelWidth = function( width ) {
                if ( typeof childScope.setYAxisLabelWidth !== 'undefined' ) {
                    childScope.setYAxisLabelWidth( width );
                }
            };

            /**
             * @ngdoc method
             * @name toggleEventType
             * @methodOf plotFrame
             * @description
             * Toggles the visibility of an event type.
             *
             * @param {number} eventType The event type (id) of the event to toggle.
             */
            scope.toggleEventType = function( eventType ) {
                var types = angular.copy( scope.menuOptions.view.eventTypes );
                var indexOfType = types.indexOf( eventType );
                if ( indexOfType >= 0 ) {
                    // the event type is currently in the list of visible types. Remove it.
                    types.splice( indexOfType, 1 );
                } else {
                    // the event type isn't in the array of visible types, so add it
                    types.push( eventType );
                }
                scope.setMenuOptions( {view:{eventTypes:types}} );
            };

            /**
             * @ngdoc method
             * @name downloadCSVforDatasets
             * @methodOf plotFrame
             * @description
             * Triggers a CSV download for one or more datasets at the given index or indices
             * Takes an undefined number of parameters, each one an index of a dataset to download
             */
            scope.downloadCSVforDatasets = function() {
                var datasetIndices = Array.prototype.slice.call( arguments ); // 'arguments' is not an array... convert it to one so we can use Array.prototype functions

                var CSVpaths = datasetIndices.map( function( val ) {
                    return scope.getCSVdownloadPath( val );
                });

                // tell the latis factory which datasets we want to download. It will decide how they are downloaded
                var timeFormatQuery;
                if ( scope.menuOptions.timeLabels.format === 'secondsSinceT0' ) {
                    timeFormatQuery = latis.timeFormatters.secondsSinceT0( actualTimeRange.total.start );
                } else {
                    timeFormatQuery = latis.timeFormatters.simple( scope.menuOptions.timeLabels.momentTimeFormat );
                }
                latis.downloadCSV( CSVpaths, timeFormatQuery );
            };

            /**
             * @ngdoc method
             * @name getCSVdownloadPath
             * @methodOf plotFrame
             * @description
             * Builds the URL path for one dataset to download a CSV of the data from latis
             *
             * @param {integer} index Index of the dataset to build a CSV path for
             */
            scope.getCSVdownloadPath = function( datasetIndex ) {
                // To make the download URL, take the URL we used to get the data
                var timeParams = '',
                    offsetDate;
                var offsetMs = ChartData.parseOffset( scope.datasets[datasetIndex].offset );
                if ( scope.timeRange.total.start !== null ) {
                    offsetDate = new Date( scope.timeRange.total.start.getTime() + offsetMs );
                    timeParams += '&time>=' + offsetDate.toISOString();
                }
                if ( scope.timeRange.total.end !== null ) {
                    offsetDate = new Date( scope.timeRange.total.end.getTime() + offsetMs );
                    timeParams += '&time<=' + offsetDate.toISOString();
                }

                return scope.datasets[datasetIndex].accessURL + timeParams + scope.getFilterQuery( scope.datasets[datasetIndex] );
            };

            /**
             * @ngdoc method
             * @name removePlot
             * @methodOf plotFrame
             * @description
             * removes the plot from the main list, and aborts any pending GET requests
             */
            scope.removePlot = function() {
                var found = false;
                for ( var index = 0; index < scope.plotList.length; index++ ) {
                    if ( scope === scope.plotList[index].plotObj ) {
                        found = true;
                        break;
                    }
                }
                if ( found ) {
                    scope.plotList[index] = null;
                    scope.plotList.splice( index, 1 );
                    scope.$emit( 'removePlot' );
                } else {
                    console.error( 'Can\'t remove plot??? Not found in plot list' );
                }
            };

            scope.$on( '$destroy', function() {
                Logger.log('$on: destroy - Removing click event listener');
                $window.removeEventListener( 'click', closeDropdownMenusOnClick );
                if ( typeof childScope.onDestroy !== 'undefined' ) {
                    childScope.onDestroy();
                }
                //cancel any outstanding requests
                cancelling = true;
                if ( typeof scope.cancel !== 'undefined' ) {
                    scope.cancel.resolve();
                }
            });

            // the child scope can change the visible time range by emitting this event
            scope.$on( 'setVisibleTimeRange', function( evt, min, max, updateScope ) {
                if ( scope.loading ) return;
                Logger.log( '$on: setVisibleTimeRange', min, max );

                // the child scope has changed what time range is visible, but we still need to update our data model and add the change to the zoom history.
                // If setTimeRange was previously called with a new visible range, the code would have added the change to the zoom history and set the new extremes on the plot.
                // In that case, the below call to setTimeRange will do nothing, because there will be no change to timeRange.visible
                scope.setTimeRange({
                    visible: {
                        start: new Date( min ),
                        end: new Date( max )
                    }
                });

                // check if the plot shows data points in the current range, for determining whether to show the "Increase resolution" button
                // this may be computationally expensive, so only check if we meet all other conditions for showing the button
                if ( !scope.fullResolution && !scope.dataError && !scope.loading && !scope.visibleTimeRangeMatchesTotal() && scope.datasetType !== DatasetTypes.DISCRETE ) {
                    scope.checkIfDataExistsInCurrentRange();
                }

                // when this function is called as a result of Highchart's "afterSetExtremes" callback firing, the scope needs to update.
                if ( updateScope ) {
                    $timeout( function() {
                        scope.$digest();
                    });
                }
            });

            scope.checkIfDataExistsInCurrentRange = function() {
                // false until proven true
                scope.dataExistsInCurrentRange = false;
                // loop through each data series
                /* it's fairly quick to loop through at most a few arrays of a few thousand points each (a few ms), but if  this ever
                 * takes a significant fraction of a second, we can switch to using a binary search algorithm instead
                 */
                for ( var i = 0; i < dataArray.length; i++ ) {
                    for ( var j = 0; j < dataArray[i].data.length; j++ ) {
                        var datum = dataArray[i].data[j];
                        /* when building the chart, we put null points at the beginning and end to force data-less areas to show at the
                         * beginning and end of the time range, if there are any. But we don't want to get fooled by these null points.
                         */
                        if ( datum[1] === null ) continue;
                        // if the timestamp of a data point is within the currently viewed range, we've seen enough
                        if ( datum[0] >= scope.timeRange.visible.start.getTime() && datum[0] <= scope.timeRange.visible.end.getTime() ) {
                            scope.dataExistsInCurrentRange = true;
                            return;
                        }
                    }
                }
                // no data is shown in current range :(
            };

            scope.updateTooltip = function( clearData ) {
                if ( typeof clearData === 'undefined' ) clearData = false;
                if ( childScope.updateTooltip ) childScope.updateTooltip( clearData );
            };

            scope.$watch( 'datasets', function( newDatasets, oldDatasets ) {
                if ( newDatasets === oldDatasets ) {
                    return;
                }
                // The new datasets object may not have the structure we want (filters, etc).
                // Add all the required properties, even though they may be empty.
                // Doing this will change scope.datasets, triggering the watcher again.
                // We don't want to fire initPlotFame() twice, so only do it if fixDatasetsObject()
                // has already made its changes.
                var newDatasetsCopy = JSON.stringify( newDatasets );
                fixDatasetsObject();
                if ( newDatasetsCopy == JSON.stringify(scope.datasets) ) {
                    Logger.log( '$watch: Datasets' );
                    scope.initPlotFrame();
                }
            }, true);

            // watch the width of the plot, which is determined by HTML/CSS
            var timer = false; //this allows us to debounce this $watcher, we don't want it updating with animations
            scope.$watch( function() {
                return element[0].clientWidth;
            }, function () {
                if ( timer ) {
                    $timeout.cancel( timer );
                }
                timer = $timeout( function() {
                    // scope.elementWidth is used by the HTML template for this directive
                    scope.elementWidth = element[0].clientWidth;
                    if ( typeof childScope !== 'undefined' && typeof childScope.onWidthChange !== 'undefined' ) {
                        childScope.onWidthChange();
                    }
                }, 100 );
            });

            function setMenuControls() {
                scope.menuControls = {
                    yAxisScalingLow: scope.menuOptions.yAxis.scaling.low,
                    yAxisScalingHigh: scope.menuOptions.yAxis.scaling.high,
                    gapThreshold: scope.menuOptions.dataDisplay.gaps.threshold
                };

                if ( scope.datasets.length > 0 ) {
                    // The built-in filter controls alter filters for all datasets simultaneously.
                    // Copy the filter settings for the first dataset we find that has filters enabled.
                    var d0filters = scope.datasets[0].filters;
                    if ( typeof d0filters === 'undefined' ) { return; }

                    var datasetWithFiltersEnabled = scope.datasets.find( function(ds) {
                        return ds.filters.minmax.enabled || ds.filters.delta.enabled || ds.filters.change.enabled;
                    });
                    if ( datasetWithFiltersEnabled !== undefined ) {
                        scope.filterSelection = angular.copy( datasetWithFiltersEnabled.filters );
                    } else {
                        // If no datasets have filters, initialize the filter controls to the filter settings
                        // of the first dataset, which will accurately set the controls to have no filters enabled.
                        scope.filterSelection = angular.copy( d0filters );
                    }
                }
            }

            scope.initPlotFrame = function() {
                scope.history = [];

                setMenuControls();

                //if we are given data, simply pass it to the chart
                if ( scope.data !== null && typeof scope.data !== 'undefined' ) {
                    //create an empty metadata array
                    dataArray = [];
                    scope.metadata = [];
                    // assume analog data rather than discrete or an event table. We may need to remove this assumption at some point if needs change.
                    scope.datasetType = DatasetTypes.ANALOG;
                    // wait for child scopes to initialize
                    beforeSetData().then( function() {
                        // @TODO: change the structure of scope.data which is passed to lasp-highstock, so that we define parameters, metadata, etc in a way that makes sense.
                        for ( var i = 0; i < scope.data.length; i++ ) {
                            dataArray.push( new ChartData() );
                            dataArray[i].setData( scope.data[i].data, scope.data[i].parameters, scope.data[i].indexes, scope.data[i].url, scope.data[i].name, scope.data[i].offset );
                        }
                        afterSetData();
                    });
                //otherwise we need to retrieve it from the server
                } else {
                    //send requests for data
                    scope.downloadAllDatasets();
                }
            };
            scope.initPlotFrame();
        }
    };
}


function datasetTypesService() {
    return {
        DISCRETE: 'discrete',
        ANALOG: 'analog',
        EVENT_TABLE: 'event_table'
    };
}

function limitTypesService() {
    return {
        GOOD: 'good',
        WARN: 'warn',
        BAD: 'bad'
    };
}

function headerGroupDirective() {
    return {
        restrict: 'A',
        templateUrl: 'plot_frame/header_button_group.html'
    };
}


angular.module( 'laspChart', [ 'latis', 'constants', 'ui.bootstrap' ] )
.service( 'DatasetTypes', [ datasetTypesService ])
.service( 'LimitTypes', [ limitTypesService ])
.directive( 'drawPlot', ['$uibModal', '$window', '$timeout', '$q', 'constants', 'latis', 'ChartData', 'EventsData', 'DatasetTypes', 'LoadingProgressTracker', 'Logger', plotFrame ] )
.directive( 'headerButtonGroup', [ headerGroupDirective ]);


//polyfill from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find
if (!Array.prototype.find) {
    Array.prototype.find = function(predicate) {
      'use strict';
      if (this == null) {
        throw new TypeError('Array.prototype.find called on null or undefined');
      }
      if (typeof predicate !== 'function') {
        throw new TypeError('predicate must be a function');
      }
      var list = Object(this);
      var length = list.length >>> 0;
      var thisArg = arguments[1];
      var value;

      for (var i = 0; i < length; i++) {
        value = list[i];
        if (predicate.call(thisArg, value, i, list)) {
          return value;
        }
      }
      return undefined;
    };
}

(function() { // IIFE

'use strict';

/**
 * @ngdoc service
 * @name loggerFactory
 *
 * @description
 * A tool used to control console log/debug statements made by lasp-highstock
 */
function loggerFactory () {

    var Logger = {
        // takes an undefined number of arguments and passes them to console.debug
        log: function() {
            // call console.debug with the passed args, as well as with a specific string
            // so we can filter the console statements to show only lasp-highstock debug output
            var args = Array.prototype.slice.call( arguments );
            console.debug.apply( console, ['%c[lasp-highstock]', 'background:#cfebed'].concat(args) );
        }
    };

    return Logger;
}

angular.module( 'laspChart' ).factory( 'Logger', [ loggerFactory ]);

})(); // End IIFE
'use strict';

/**
 * @ngdoc service
 * @name highchart
 *
 * @description
 * Highcharts directive currently being optimized for large datasets
 */
function highchart( Chart, ChartData, constants, DatasetTypes, LimitTypes, ColorThemes, Logger, $q, $window, $timeout, $uibModal ) {
    return {
        /**
         * This object defines our directive. It can call the functions defined above and the functions
         * defined in our helper factory.
         */
        restrict: 'E',
        template: '<div></div>',
        replace: true,
        scope: {
            highchartScope: '=',
            frameScope: '='
        },
        //link: function used for DOM manipulation tasks
        link: function ( scope, element ) {
            scope.highchartScope = scope;

            var dataArray;
            var yAxisBreaks;
            var allUsedDiscreteVals;
            var chartDataZones;


            scope.init = function() {
                //get a new instance of our chart
                scope.chart = new Chart( element[0], {
                    dataIsFullRes: function() {
                        return scope.frameScope.fullResolution;
                    },
                    getTypeConversions: function() {
                        return scope.typeConversions;
                    },
                    onAfterSetExtremes: function( min, max ) {
                        // pass the changes to the frame scope
                        scope.$emit( 'setVisibleTimeRange', min, max, true );
                    },
                    onSeriesClick: function( url ) {
                        $window.open( url, '_self' );
                    },
                    onSpacecraftEventClick: function( eventDetails ) {
                        scope.openEventModal( eventDetails );
                    }
                });

                scope.frameScope.chart = scope.chart;
            };

            scope.afterDatasetDownloaded = function( data ) {

            };

            scope.afterAllDatasetsDownloaded = function() {
                scope.chart.tooltipDecimalLengthReset = true;

                // set some default options and behaviors for different kinds of plots

                if ( scope.frameScope.datasetType === DatasetTypes.DISCRETE ) {

                    scope.menuOptions.yAxis.scaling.type = 'auto';
                    scope.menuOptions.dataDisplay.dataGrouping = false;

                    analyzeTypeConversions();
                    findYAxisBreaks();

                } else if ( scope.frameScope.datasetType === DatasetTypes.ANALOG ) {

                    analyzeYAxisUnits();
                    analyzeYAxisLimits();
                }

                // if all datasets have 0 offset, show one x-value (timestamp) in the legend.
                scope.chart.showSingleLegendXValue = dataArray.every( function(chartData) {
                    return chartData.offset == 0;
                });

                createChart();


                function analyzeTypeConversions() {
                    // create type conversions
                    scope.typeConversions = [];
                    for ( var i = 0; i < dataArray.length; i++ ) {
                        scope.typeConversions.push( dataArray[i].getTypeConversions() );
                    }

                    scope.frameScope.discreteFormattersEnabled = true;
                    // if the type conversions for all datasets are identical, then show them. Otherwise show numeric values.
                    // ignore desirability for type conversion comparison.
                    if ( dataArray.length > 1 ) {
                        var conversionsCopy = angular.copy( scope.typeConversions );
                        conversionsCopy.map( function(conversions) {
                            return conversions.map( function(conversion) {
                                delete conversion.desirability;
                                return conversion;
                            });
                        });
                        var firstTypeConversion = JSON.stringify( conversionsCopy[0] );
                        for ( i=1; i<conversionsCopy.length; i++ ) {
                            if ( firstTypeConversion !== JSON.stringify(conversionsCopy[i]) ) {
                                scope.frameScope.discreteFormattersEnabled = false;
                                break;
                            }
                        }
                    }
                }

                function findYAxisBreaks() {
                    allUsedDiscreteVals = [];
                    dataArray.forEach( function(da) {
                        allUsedDiscreteVals = allUsedDiscreteVals.concat( da.getUsedDiscreteVals() );
                    });
                    // we may have duplicate values. Get only unique values.
                    allUsedDiscreteVals = ChartData.findUniqueVals( allUsedDiscreteVals, function(el){return el;} );
                    yAxisBreaks = ChartData.calculateYAxisBreaks( allUsedDiscreteVals );
                }

                function analyzeYAxisUnits() {
                    // determine if all plotted items have the same y-axis units
                    var unitses = dataArray.map( function(datum) {
                        if ( typeof datum === 'undefined' || typeof datum.metadata === 'undefined' || typeof datum.metadata.Info === 'undefined' ) {
                            return undefined;
                        } else {
                            return datum.metadata.Info.Units;
                        }
                    });
                    var unitsArray = unitses.filter( function(units, index) { return unitses.indexOf( units ) === index && typeof units !== 'undefined'; });

                    // now we have an array of unique "Units" values. All datasets have the same units if there's only one item in the array
                    if ( unitsArray.length === 1 ) {
                        var label = unitsArray[0];
                        if ( !constants.Y_AXIS_LABEL_SHOW_UNITS_ONLY ) {
                            // find if we have one common "name" to label the y-axis with. If not, we'll default to only the units.
                            // it's currently possible for all the units to match, but not the names.
                            // in the future we may use a different property than metadata.Name.
                            var nameses = dataArray.map( function(datum) { return datum.metadata.Name; });
                            var namesArray = nameses.filter( function(names, index) { return nameses.indexOf( names ) === index; });
                            if ( namesArray.length === 1 ) {
                                label = namesArray[0] + ' (' + label + ')';
                            }
                        }
                        scope.chart.setYAxisTitle( label, false );
                    } else {
                        scope.chart.setYAxisTitle( '', false );
                    }
                }

                function analyzeYAxisLimits() {
                    // if the limits for all datasets in this plot are the same (or if there's only one dataset), show the limits.
                    // Otherwise limits will be turned off by default but users can select which dataset's limits they want to view.
                    var limitses = dataArray.map( function(array) {
                        // get the limits data, and stringify it for easy comparison
                        return JSON.stringify( array.getMetadata().Limits );
                    });
                    var uniqueLimitses = limitses.filter( function(limits, index) { return limitses.indexOf( limits ) === index && typeof limits !== 'undefined'; });

                    // now we have an array of unique "Limits" values. All datasets have the same limits if there's only one item in the array
                    scope.menuOptions.selectedLimitsIndex = undefined;
                    scope.frameScope.enableLimitsSelection = false;

                    if ( uniqueLimitses.length === 1 ) {
                        scope.menuOptions.selectedLimitsIndex = 0;
                    } else if ( scope.frameScope.isOverplot() ) {
                        // temprarily disable the limit bands,
                        // so we can let the user choose which dataset to show limits for
                        scope.frameScope.enableLimitsSelection = true;
                        scope.chart.disableYAxisLimitBands( false );
                    }
                }
            };

            function createChart() {
                // don't even bother with this if there's a server error
                if ( scope.frameScope.dataError === 'Server Error' ) {
                    return;
                }

                // apply all uiOptions and menuOptions
                scope.onSetUiOptions();
                scope.onSetMenuOptions();

                // allow parent scopes to make custom changes to the chart config before/after the plot initializes
                function beforeInit( config ) {
                    scope.$emit( 'beforeChartInit', config );
                }
                function afterInit( chart ) {
                    scope.$emit( 'afterChartInit', chart );
                }

                scope.chart.init( beforeInit, afterInit );

                // keep track of x-offsets for every series we add to the plot
                var seriesOffsets = [];

                // add series
                dataArray.forEach( function(chartData, chartDataIndex ) {
                    if ( scope.menuOptions.dataDisplay.dataGrouping ) {
                        // We don't want to apply data grouping to a chart which only contains a line series...
                        // peaks and valleys would be clobbered. The function below artificially creates a min/max
                        // arearange series if needed.
                        chartData.createMinMaxDataFromLine();
                    } else {
                        // The function below destroys the artificial min/max arearange if one was created.
                        chartData.removeMinMaxDataCreatedFromLine();
                    }

                    chartData.getSeriesTypes().forEach( function(seriesType, i) {
                        // assume that series after the first aren't needed at full res
                        // If data grouping is on, we'll always need both line and arearange series, because even full-res data
                        // can be 'grouped', which will smooth out peaks and valleys on a line series.
                        if ( i > 0 && scope.frameScope.fullResolution && !scope.menuOptions.dataDisplay.dataGrouping ) {
                            return;
                        }

                        var dataToPlot;
                        if ( seriesType === 'line' ) {
                            dataToPlot = scope.menuOptions.dataDisplay.gaps.enabled ?
                                chartData.getDataWithGaps( scope.menuOptions.dataDisplay.gaps.threshold ) :
                                chartData.getData();
                        } else if ( seriesType === 'arearange' ) {
                            dataToPlot = scope.menuOptions.dataDisplay.gaps.enabled ?
                                chartData.getMinMaxDataWithGaps( scope.menuOptions.dataDisplay.gaps.threshold ) :
                                chartData.getMinMaxData();
                        }

                        var color = undefined;
                        // set the color of this series based on the color of the previous series
                        if ( i > 0 ) {
                            var allSeries = scope.chart.getAllSeries();
                            color = allSeries[ allSeries.length -1].color;
                        }

                        scope.chart.addSeries(
                            dataToPlot,
                            chartDataIndex,
                            i > 0 && seriesType === 'arearange' ? 'range' : chartData.getYNameAndUnits(),
                            color,
                            seriesType,
                            false,
                            chartData.getLinkURL()
                        );
                        seriesOffsets.push( chartData.offset );
                    });
                });

                scope.chart.seriesOffsets = seriesOffsets;

                if ( scope.menuOptions.view.limitViolationFlags ) {
                    applyColorZones();
                }

                if ( scope.menuOptions.view.events ) {
                    addEventsToChart( scope.frameScope.eventsData.events );
                    scope.chart.setEventTypeVisibility( scope.menuOptions.view.eventTypes );
                }

                // Show the defined visible time range
                scope.applyVisibleTimeRange( false );

                // now that we're done adding series and altering the chart object, trigger a redraw
                scope.chart.redraw();
            }


            scope.setDataArray = function( d ) {
                dataArray = d;
            };

            scope.getExtraAccessURLParameters = function() {
                if ( scope.frameScope.datasetType !== DatasetTypes.DISCRETE && scope.frameScope.datasetType !== DatasetTypes.STRING && typeof constants.NUM_BINS !== 'undefined' ) {
                    return '&binave(' + constants.NUM_BINS + ')&exclude_missing()';
                } else return '';
            };

            scope.downloadImage = function( filetype, filename ) {
                scope.chart.downloadImage( filetype, filename );
            };

            scope.updateTooltip = function( clearData ) {
                scope.chart.updateTooltip( clearData );
            };

            function getExtremesWithPadding(extremeLow, extremeHigh, plotHeightPixels, paddingPixels) {
                // based on the chart pixel height and extremes we wish to show (given in y-axis units), find the new extremes in y-axis units in order to have a certain amount of 'padding' in pixels on the top and bottom.
                if ( typeof paddingPixels === 'undefined' ) {
                    paddingPixels = 20;
                }
                if ( scope.menuOptions.yAxis.scaleType === 'logarithmic' ) {
                    paddingPixels = 0;
                }

                var diff = (plotHeightPixels * extremeHigh - paddingPixels * (extremeHigh + extremeLow)) / (plotHeightPixels - 2 * paddingPixels) - extremeHigh;
                return {
                    low: extremeLow - diff,
                    high: extremeHigh + diff
                };
            }

            scope.applyVisibleTimeRange = function( redraw ) {
                redraw = typeof redraw === 'undefined' ? true : redraw;
                // If we changed our x-axis, we want to re-calculate a max decimal precision for tooltips
                scope.chart.tooltipDecimalLengthReset = true;

                // if start/end are null, the axis will show the max range
                var visibleStartTime = scope.timeRange.visible.start === null ? null : scope.timeRange.visible.start.getTime();
                var visibleEndTime = scope.timeRange.visible.end === null ? null : scope.timeRange.visible.end.getTime();
                var totalStartTime = scope.timeRange.total.start === null ? null : scope.timeRange.total.start.getTime();
                var totalEndTime = scope.timeRange.total.end === null ? null : scope.timeRange.total.end.getTime();

                scope.chart.setExtremes(
                    visibleStartTime,
                    visibleEndTime,
                    totalStartTime,
                    totalEndTime,
                    redraw
                );
            };

            // rather than listening for scope.$on( $destroy ), we let the parent scope directly call this destroy function.
            // if we listen for $destroy, the listener seems to fire after the parent scope has already been destroyed,
            // and the chart.destroy function encounters errors as it tries to remove attributes from an HTML element that no longer exists.
            scope.onDestroy = function() {
                scope.chart.destroy();
            };

            scope.resetYZoom = function() {
                scope.chart.resetYZoom();
            };

            scope.onWidthChange = function() {
                // reflow the plot to fit the new width, but save some cycles by not doing this when collapsed
                if ( !scope.uiOptions.collapsed && scope.chart.chart ) scope.chart.reflow();
            };

            // watch for changes in the width of the y-axis label area
            scope.$watch( function() {
                return scope.getDefaultYAxisLabelWidth();
            }, function( newWidth, oldWidth ) {
                if ( newWidth === oldWidth || scope.frameScope.loading ) {
                    return;
                }
                // tell the world about the change. Have the frame scope emit it so apps don't have to listen to this directive
                scope.frameScope.$emit( 'yAxisLabelWidthChange', newWidth, oldWidth );
            });

            scope.getDefaultYAxisLabelWidth = function() {
                var yAxisLabels = element[0].querySelectorAll('.highcharts-axis-labels.highcharts-yaxis-labels');
                var width = 0;
                if ( yAxisLabels ) {
                    // yAxisLabels may contain the navigator's y-axis label container as well (the DOM element will be there, even if it contains no labels)
                    // Only find the width of the non-navigator y-axis labels.
                    // The events y-axis labels also cause some issues---in that case, we want to find the width of individual labels, not the container for them.
                    for ( var i = 0; i < yAxisLabels.length; i++ ) {
                        var labelsElement = angular.element(yAxisLabels[i]);
                        if ( !labelsElement.hasClass('highcharts-navigator-yaxis') && !labelsElement.hasClass('events-y-axis') ) {
                            // round the number because we don't need huge accuracy here
                            // Get the largest width, searching through the regular y-axis and the events labels.
                            width = Math.max( width, Math.round( labelsElement[0].getBoundingClientRect().width ) );
                        }
                    }
                    // Find the greatest with of the individual events axis labels
                    var eventsLabels = element[0].querySelectorAll('.events-label');
                    if ( Array.isArray(eventsLabels) ) {
                        eventsLabels.forEach( function(eventsLabel) {
                            width = Math.max( width, angular.element(eventsLabel).parent()[0].getBoundingClientRect().width );
                        });
                    }

                    // if units are shown on the y-axis, the .highcharts-yaxis element will have a greater width than the label area. We'd want to use that one instead.
                    var yAxis = element[0].querySelectorAll('.highcharts-axis.highcharts-yaxis');
                    for ( var i = 0; i < yAxis.length; i++ ) {
                        if ( !angular.element(yAxis[i]).hasClass('highcharts-navigator-yaxis') ) {
                            width = Math.max( width, Math.round( yAxis[i].getBoundingClientRect().width ) );
                        }
                    }
                    return width;
                }
                return 0;
            };

            scope.setYAxisLabelWidth = function( width ) {
                if ( scope.chart ) {
                    scope.chart.setYAxisLabelWidth( width );
                }
            };

            /**
             * @ngdoc method
             * @name onSetMenuOptions
             * @methodOf laspChart
             * @description
             * Applies new menu options, or applies all menu options. If applying only new options, this function must be called after changing scope.menuOptions.
             * If applying all menu options, there is no prerequisite.
             *
             * @param {object} [oldOptions] The old set of menuOptions. Omit this parameter to apply all menuOptions instead of only the ones which have changed.
             */
            scope.onSetMenuOptions = function( oldOptions ) {
                // if oldOptions is undefined, apply all menuOptions, but don't recreate/redraw the chart, or alter the chart object, because it hasn't been initialized yet
                var applyAll = typeof oldOptions === 'undefined';
                var updateChart = typeof scope.chart.chart !== false && !scope.frameScope.loading && !applyAll;

                var redraw = false,
                    recreate = false;
                // shorthand variables used in many places throughout this function
                // Their values are set by hasChanged()
                var newValue,
                    oldValue;

                if ( hasChanged('dataDisplay.dataGrouping') ) {
                    scope.chart.setDataGroupingEnabled( newValue, false );
                    recreate = true;
                }

                if ( hasChanged('dataDisplay.gaps') ) {
                    // Just recreate the chart to let lasp_chart code apply data with calculated gaps
                    // The gaps are calculated in the ChartData object
                    recreate = true;
                }

                if ( hasChanged('dataDisplay.seriesDisplayMode') ) {
                    // ensure seriesDisplayMode is a valid value
                    var validValues = ['lines','points','linesAndPoints'];
                    if ( validValues.indexOf(newValue) === -1 ) {
                        console.error( 'Error: "' + newValue + '" is an invalid value for seriesDisplayMode. Must be one of: ' + validValues.join(',') );
                    } else {
                        scope.chart.setSeriesDisplayMode( newValue, false );
                        redraw = true;
                    }
                }

                if ( hasChanged('dataDisplay.showMinMax') ) {
                    if ( scope.frameScope.datasetType === DatasetTypes.ANALOG ) {
                        scope.chart.setRangeVisibility( newValue, false );
                        redraw = true;
                    }
                }

                if ( hasChanged('selectedLimitsIndex') ) {
                    // make sure the selected limits index stays within a valid range.
                    if ( newValue >= dataArray.length ) {
                        scope.menuOptions.selectedLimitsIndex = 0;
                    }
                    // run the same code for when menuOptions.view.limits changes. This will update the limit bands if limits are currently shown
                    onViewLimitsChanged();
                    // re-apply y axis scaling values if scaled to limits
                    if ( scope.menuOptions.yAxis.scaling.type === 'yellow' || scope.menuOptions.yAxis.scaling.type === 'red' ) {
                        onYAxisScalingChanged();
                    }
                    redraw = true;
                }

                if ( hasChanged('selectedXAxisIndex') ) {
                    // make sure the selected xaxis index stays within a valid range.
                    if ( newValue >= dataArray.length ) {
                        scope.menuOptions.selectedXAxisIndex = 0;
                    }
                    // update the offset property on the chart.
                    scope.chart.xAxisValueOffset = ChartData.parseOffset( dataArray[scope.menuOptions.selectedXAxisIndex].offset );
                    redraw = true;
                }

                if ( hasChanged('timeLabels.format') ) {
                    scope.chart.setXAxisLabels( newValue, false );
                    // With raw value formatting, add an x-axis title. Otherwise, the date formatting obviously indicates that the x-axis is time, so clear the x-axis title.
                    scope.chart.setXAxisTitle( newValue === 'raw' ? dataArray[0].getXNameAndUnits() : '', false );
                    redraw = true;
                }

                if ( hasChanged('timeLabels.legendFormatter') ) {
                    scope.chart.legendFormatter = newValue;
                    redraw = true;
                }

                if ( hasChanged('timeLabels.momentTimeFormat') ) {
                    scope.chart.momentTimeFormat = newValue;
                    redraw = true;
                }

                if ( hasChanged('timeLabels.timezone') ) {
                    scope.chart.timezone = newValue;
                    redraw = true;
                }

                if ( hasChanged('view.events') ) {
                    // add events series to the plot or remove them
                    if ( newValue ) {
                        // when this is called during plot creation, the events will not actually be added here,
                        // because the highstock chart object doesn't yet exist.
                        // The events series are added in createChart().
                        addEventsToChart( scope.frameScope.eventsData.events, false );
                    } else {
                        scope.chart.removeEvents( false );
                    }
                    updateViewEventTypes();
                    redraw = true;
                }

                if ( hasChanged('view.eventTypes') ) {
                    updateViewEventTypes();
                    redraw = true;
                }

                if ( hasChanged('view.horizontalCrosshair') ) {
                    scope.chart.setYAxisCrosshairEnabled( newValue, false );
                    redraw = true;
                }

                if ( hasChanged('view.legend') ) {
                    scope.chart.setLegendEnabled( newValue, false );
                    redraw = true;
                }

                if ( hasChanged('view.limits') ) {
                    if ( scope.frameScope.datasetType === DatasetTypes.ANALOG ) {
                        onViewLimitsChanged();
                        redraw = true;
                    }
                }

                if ( hasChanged('view.limitViolationFlags') ) {
                    // define the zones for each separate item that was downloaded.
                    // if we're turning this feature off, defining the zones as empty arrays will remove the coloring.
                    var zoneColors = scope.chart.colorTheme.limits.zones;
                    chartDataZones = dataArray.map( function(chartData) {
                        return newValue ? chartData.getLimitZones(zoneColors.good, zoneColors.warn, zoneColors.bad) : [];
                    });
                    applyColorZones();
                    redraw = true;
                }

                if ( hasChanged('view.navigator') ) {
                    scope.chart.setNavigatorEnabled( newValue, false );

                    if ( !oldValue && newValue ) {
                        // Due to a highstock bug, we must sometimes recreate the plot when showing the navigator.
                        // We can switch to always redrawing when this is resolved:
                        // https://github.com/highcharts/highcharts/issues/7067
                        recreate = true;
                    } else {
                        redraw = true;
                    }
                }

                if ( hasChanged('view.scrollbar') ) {
                    scope.chart.setScrollbarEnabled( newValue, false );
                    redraw = true;
                }

                if ( hasChanged('yAxis.labels.hideUnusedDiscreteLabels') ) {
                    if ( scope.frameScope.datasetType === DatasetTypes.DISCRETE ) {
                        if ( newValue ) {
                            scope.chart.hideUnusedDiscreteLabels( yAxisBreaks, allUsedDiscreteVals, false );
                        } else {
                            scope.chart.showAllDiscreteLabels( scope.typeConversions, false );
                        }
                        redraw = true;
                    }
                }

                if ( hasChanged('yAxis.labels.showNumericDiscreteValues') ) {
                    // always show numeric values if the discrete formatters are not enabled
                    newValue = scope.frameScope.discreteFormattersEnabled ? newValue : true;
                    if ( scope.frameScope.datasetType === DatasetTypes.DISCRETE ) {
                        scope.chart.setDiscreteFormatters( newValue ? false : scope.typeConversions, false );
                        redraw = true;
                    }
                }

                if ( hasChanged('yAxis.scaling') ) {
                    onYAxisScalingChanged();
                    redraw = true;
                }

                if ( hasChanged('yAxis.scaleType') ) {
                    if ( scope.frameScope.datasetType === DatasetTypes.ANALOG ) {
                        scope.chart.setYAxisScaleType( newValue, false );
                        redraw = true;
                    }
                }

                if ( hasChanged('zoomMode') ) {
                    scope.chart.setZoomType( newValue, false );
                    redraw = true;
                }


                // execute only the most expensive chart-refreshing function, because the more expensive ones will invoke the less expensive ones
                if ( updateChart ) {
                    if ( recreate ) {
                        createChart();
                    } else if ( redraw ) {
                        scope.chart.redraw();
                    }
                }

                // convenience function for checking if an option has changed.
                // Takes a menuOption name as a string, like 'yAxis.scaling.type'
                // This function replaces if-statements like this:
                //    if ( !angular.equals(oldOptions.dataDisplay.gaps, scope.menuOptions.dataDisplay.gaps) )
                // ... with something more readable like this:
                //    if ( hasChanged('dataDisplay.gaps') )
                // This also sets the values of olValue and newValue
                function hasChanged( optionNameAsString ) {
                    if ( applyAll ) {
                        oldValue = newValue = eval( 'scope.menuOptions.' + optionNameAsString );
                        return true;
                    }

                    oldValue = eval( 'oldOptions.' + optionNameAsString );
                    newValue = eval( 'scope.menuOptions.' + optionNameAsString );
                    var changed = !angular.equals( oldValue, newValue );
                    if ( changed ) {
                        Logger.log( 'menuOption changed: ' + optionNameAsString );
                    }
                    return changed;
                }
            };

            function applyColorZones() {
                // update each series with the appropriate color zones, as defined in chartDataZones
                scope.chart.getAllSeries().forEach( function(series, i) {
                    var userOptions = series.userOptions;
                    if ( typeof userOptions !== 'undefined' ) {
                        var chartDataIndex = userOptions.chartDataIndex;
                        if ( typeof chartDataIndex !== 'undefined' ) {
                            scope.chart.setSeriesColorZones( series.index, chartDataZones[chartDataIndex], false );
                        }
                    }
                });
            }

            // update the settings for viewing limits
            function onViewLimitsChanged() {
                if ( scope.menuOptions.view.limits === true ) {
                    var limitsIndex = scope.menuOptions.selectedLimitsIndex;
                    if ( typeof limitsIndex !== 'undefined' ) {
                        var metadata = dataArray[ limitsIndex ].getMetadata();
                        if ( metadata.Limits ) {
                            scope.chart.setYAxisLimitBands( metadata.Limits.Red.Low, metadata.Limits.Red.High, metadata.Limits.Yellow.Low, metadata.Limits.Yellow.High, false );
                        }
                    }
                } else {
                    scope.chart.disableYAxisLimitBands( false );
                }
            }

            // apply the settings in menuOptions.yAxis.scaling
            function onYAxisScalingChanged() {
                if ( scope.frameScope.datasetType === DatasetTypes.DISCRETE ) {
                    // y-axis scaling shouldn't be changed for discrete plots
                    return;
                }

                scope.frameScope.yAxisScalingError = undefined;

                var low = undefined;
                var high = undefined;
                var limitExtremes;

                // shorthand vars
                var selectedLimitsIndex = scope.menuOptions.selectedLimitsIndex;
                var scaling = scope.menuOptions.yAxis.scaling;

                if ( scaling.type === 'auto' ) {
                    low = null;
                    high = null;
                } else if ( scaling.type === 'custom' ) {
                    // check to make sure inputs are valid
                    if ( typeof scaling.low !== 'number' || typeof scaling.high !== 'number' ) {
                        scope.frameScope.yAxisScalingError = 'Please enter two numbers.';
                        return;
                    } else if ( scaling.low >= scaling.high ) {
                        scope.frameScope.yAxisScalingError = '"Low" must be lower than "High".';
                        return;
                    }

                    limitExtremes = getExtremesWithPadding( scaling.low, scaling.high, scope.uiOptions.plotHeight );
                    low = limitExtremes.low;
                    high = limitExtremes.high;
                } else if ( scaling.type === 'yellow' || scaling.type === 'red' ) {
                    if ( typeof selectedLimitsIndex !== 'undefined' && typeof scope.frameScope.metadata[ selectedLimitsIndex ].Limits !== 'undefined' ) {
                        var selectedLimits = scope.frameScope.metadata[ selectedLimitsIndex ].Limits;
                        limitExtremes = scaling.type === 'yellow' ? getExtremesWithPadding( selectedLimits.Yellow.Low, selectedLimits.Yellow.High, scope.uiOptions.plotHeight )
                                : scaling.type === 'red' ? getExtremesWithPadding( selectedLimits.Red.Low, selectedLimits.Red.High, scope.uiOptions.plotHeight )
                                : { low: undefined, high: undefined };
                        low = limitExtremes.low;
                        high = limitExtremes.high;
                    }
                }

                if ( typeof low !== 'undefined' ) {
                    scope.chart.setYAxisScaling( low, high, false );
                }
            }

            function updateViewEventTypes() {
                // update chart options to show or hide the extra y-axis
                scope.chart.setEventsOverlay( scope.menuOptions.view.events, scope.frameScope.eventsData, scope.menuOptions.view.eventTypes, false );
                scope.chart.setEventTypeVisibility( scope.menuOptions.view.eventTypes, false );
            }

            function addEventsToChart( events ) {
                var startMs = scope.timeRange.total.start === null ? undefined : scope.timeRange.total.start.getTime();
                var endMs = scope.timeRange.total.end === null ? undefined : scope.timeRange.total.end.getTime();
                events.forEach( function(event) {
                    var eventSeriesColor = ColorThemes.getColorForEventType( event.type, scope.frameScope.eventsData.types, scope.chart.colorTheme ).series;
                    scope.chart.addEvent( event, eventSeriesColor, startMs, endMs );
                });
            }

            scope.onSetUiOptions = function( oldOptions ) {
                var applyAll = typeof oldOptions === 'undefined';
                var updateChart = typeof scope.chart.chart !== false && !scope.frameScope.loading && !applyAll;

                var recreate = false,
                    redraw = false,
                    reflow = false;

                if ( applyAll || scope.uiOptions.colorTheme !== oldOptions.colorTheme ) {
                    scope.chart.setColorTheme( scope.uiOptions.colorTheme, false );
                    // Recreate the plot rather than updating it, because setting series colors correctly gets complicated.
                    // The user isn't likely to change the color theme often anyway.
                    recreate = true;
                }

                if ( applyAll || scope.uiOptions.plotHeight !== oldOptions.plotHeight ) {
                    scope.chart.setHeight( scope.uiOptions.plotHeight, false );
                    reflow = true;
                }

                if ( applyAll || scope.uiOptions.legendAlign !== oldOptions.legendAlign ) {
                    scope.chart.setLegendAlign( scope.uiOptions.legendAlign, false );
                    redraw = true;
                }

                if ( applyAll || scope.uiOptions.showResetZoomButton !== oldOptions.legendAlign ) {
                    scope.chart.setResetZoomButtonEnabled( scope.uiOptions.showResetZoomButton, false );
                    redraw = true;
                }

                Logger.log( 'Setting UI options' );

                // execute only the most expensive chart-refreshing function, because the more expensive ones will invoke the less expensive ones
                if ( updateChart ) {
                    if ( recreate ) {
                        createChart();
                    } else if ( redraw ) {
                        scope.chart.redraw();
                    } else if ( reflow && !scope.uiOptions.collapsed ) {
                        // save some cycles by not reflowing when the plot is collapsed
                        scope.chart.reflow();
                    }
                }
            };

            scope.openEventModal = function( eventDetails ) {
                // eventDetails contains type, start, end
                scope.modalInstance = $uibModal.open({
                    templateUrl: 'events_modal/events_modal.html',
                    controller: 'eventsModalCtrl',
                    controllerAs: '$ctrl',
                    size: 'md',
                    resolve: {
                        eventDetails: function () {
                            return eventDetails;
                        },
                        timeLabelsOptions: function() {
                            return scope.menuOptions.timeLabels;
                        }
                    }
                });
            };

        }
    };
}


/**
 * This describes a module with a directive and a factory.
 * The functions below this statement then define those two objects.
 */
angular.module( 'laspChart' )
.directive( 'highchart', [
    'Chart',
    'ChartData',
    'constants',
    'DatasetTypes',
    'LimitTypes',
    'ColorThemes',
    'Logger',
    '$q',
    '$window',
    '$timeout',
    '$uibModal',
    highchart
]);

'use strict';

/**
 * @ngdoc service
 * @name eventTable
 *
 * @description
 * Directive used to show a table of date and string values
 */
function eventTable() {
    return {
        restrict: 'E',
        templateUrl: 'event_table/event_table.html',
        replace: true,
        scope: {
            eventTableScope: '=',
            frameScope: '='
        },
        link: function( scope, element ) {
            scope.eventTableScope = scope;
            scope.tableStyle = {};
            scope.tableData = [];

            var dataArray;

            scope.init = function() {

            };

            scope.setDataArray = function( d ) {
                dataArray = d;
            };

            scope.afterDatasetDownloaded = function( data ) {

            };

            scope.afterAllDatasetsDownloaded = function() {
                scope.onSetMenuOptions();
                scope.onSetUiOptions();
                recreateTable();
            };

            scope.applyVisibleTimeRange = function() {
                // maybe scroll the table to the start of the visible time range? Would the user find this odd?
            };

            scope.onSetMenuOptions = function( oldOptions ) {
                var recreate = false;

                if ( oldOptions && !angular.equals(scope.menuOptions.timeLabels, oldOptions.timeLabels) ) {
                    recreate = true;
                }

                if ( recreate ) {
                    recreateTable();
                }
            };

            scope.onSetUiOptions = function( oldOptions ) {
                if ( typeof oldOptions === 'undefined' || scope.uiOptions.plotHeight !== oldOptions.plotHeight ) {
                    scope.tableStyle.height = scope.uiOptions.plotHeight + 'px';
                }
            };

            function recreateTable() {
                // copy the data from dataArray and format the time
                scope.tableData = angular.copy( dataArray[0].data );

                /* For timeseries charts, the dates are formatted according to the value of menuOptions.timeLabels.format.
                 * Although the event table has no x-axis, it does have dates that need to be formatted, so we use the same
                 * menuOptions value to determine how to format the dates here
                 */
                if ( scope.menuOptions.timeLabels.format !== 'none' && scope.tableData.length > 0 ) {
                    var formatter = ( scope.menuOptions.timeLabels.format === 'secondsSinceT0' ) ? dateFormatterT0 : dateFormatterDefault;
                    var t0 = Number( scope.tableData[0][0] );
                    scope.tableData.forEach( function( entry, index ) {
                        scope.tableData[index][0] = formatter( Number(entry[0]), t0 );
                    });
                }
            }

            function dateFormatterDefault( msSinceEpoch ) {
                var tempDate = moment.utc( new Date( msSinceEpoch ) );
                var timezone = scope.menuOptions.timeLabels.timezone;
                var timeFormat = scope.menuOptions.timeLabels.momentTimeFormat;
                tempDate.tz( timezone );
                return tempDate.format( timeFormat + ' HH:mm:ss');
            }

            function dateFormatterT0( msSinceEpoch, t0 ) {
                return '+' + ( Math.round( (msSinceEpoch - t0) / 1000) ) + 's';
            }
        }
    };
}

angular.module( 'laspChart' ).directive( 'eventTable', [ eventTable ]);

'use strict';
angular.module( 'laspChart' ).controller( 'downloadCtrl', [
    '$scope',
    '$uibModalInstance',
    'data',
    function( $scope, $uibModalInstance, data ) {
        /**
         * @ngdoc service
         * @name dialogCtrl
         * @requires $scope
         * @requires $uibModalInstance
         *
         * @description
         * Modal controller for viewing a list of downloadable datasets
         */

        $scope.datasets = data.datasets;
        $scope.downloadFunc = data.downloadFunc;
        $scope.datasetIsEmpty = data.datasetIsEmpty;
        $scope.formData = {
            selectedDatasets: []
        };

        /**
         * @ngdoc method
         * @name setAllSelected
         * @methodOf dialogCtrl
         * @description
         * Either selects or deselects all checkboxes.
         *
         * @param {boolean} selected Whether all checkboxes should be selected.
         */
        $scope.setAllSelected = function( selected ) {
            $scope.datasets.forEach( function( dataset, i ) {
                if ( !$scope.datasetIsEmpty( dataset ) ) {
                    $scope.formData.selectedDatasets[i] = selected;
                }
            });
        };

        /**
         * @ngdoc method
         * @name someAreSelected
         * @methodOf dialogCtrl
         * @description
         * Returns true if any of the checkboxes are checked, false otherwise.
         */
        $scope.someAreSelected = function() {
            return $scope.formData.selectedDatasets.some( function( val ) {
                return val;
            });
        };

        /**
         * @ngdoc method
         * @name downloadSelectedDatasets
         * @methodOf dialogCtrl
         * @description
         * Triggers a download of the selected datasets.
         */
        $scope.downloadSelectedDatasets = function() {
            // convert an array of true/false to an array of dataset indices to be downloaded
            var datasetsToDownload = [];
            $scope.formData.selectedDatasets.forEach( function( val, index ) {
                if ( val ) datasetsToDownload.push( index );
            });
            $scope.downloadFunc.apply( null, datasetsToDownload );
            $scope.cancel();
        };

        /**
         * @ngdoc method
         * @name cancel
         * @methodOf dialogCtrl
         * @description
         * Dismisses the dialog modal
         */
        $scope.cancel = function() {
            $uibModalInstance.dismiss( 'cancel' );
            $scope.$destroy();
        };
    }
]);

'use strict';
angular.module( 'laspChart' ).controller( 'dialogCtrl', [
    '$scope',
    '$uibModalInstance',
    '$sce',
    'data',
    function( $scope, $uibModalInstance, $sce, data ) {
        /**
         * @ngdoc service
         * @name dialogCtrl
         * @requires $scope
         * @requires $uibModalInstance
         * @requires $sce
         *
         * @description
         * Modal controller for viewing metadata
         */

        /**
         * @ngdoc method
         * @name cancel
         * @methodOf dialogCtrl
         * @description
         * Dismisses the dialog modal
         *
         * @example
         * ```
         * $scope.cancel();
         * ```
         */
        $scope.closeMetadata = function() {
            $scope.isMetadataOpen = false;
            $uibModalInstance.dismiss( 'cancel' );
            $scope.$destroy();
        };

        //initialization stuff:
        $scope.modal = {
            catalog: null,
            selectedDatasets: null,
            overplot: null,
            autoExpandNum: null,
            searchQuery: null,
            isCollapsed: null
        };

        $scope.isMetadataOpen = true;
        $scope.modal.metadata = data;
    }
]);
'use strict';
angular.module( 'laspChart' ).controller( 'timeRangeModalCtrl', [
    '$scope',
    '$uibModalInstance',
    'data',
    function( $scope, $uibModalInstance, data ) {

        $scope.date = {
            start: data.timeRange.total.start,
            end: data.timeRange.total.end
        };

        $scope.datePickerConfig = {
            type: "datetime_minimal",
            timeFormat: data.menuOptions.timeLabels.momentTimeFormat,
            timezone: data.menuOptions.timeLabels.timezone === 'Zulu' ? 'utc' : 'local'
        };

        $scope.hasOffsetDatasets = data.hasOffsetDatasets;

        /**
         * @ngdoc method
         * @name ok
         * @methodOf timeRangeModalCtrl
         * @description
         * Dismisses the dialog modal and returns the input values to the parent scope
         */
        $scope.ok = function() {
            $uibModalInstance.close({
                date: $scope.date,
                timeFormat: $scope.datePickerConfig.timeFormat
            });
            //destroy the scope so we don't have to watch through it anymore
            $scope.$destroy();
        };

        /**
         * @ngdoc method
         * @name cancel
         * @methodOf timeRangeModalCtrl
         * @description
         * Dismisses the dialog modal
         */
        $scope.cancel = function() {
            $uibModalInstance.dismiss( 'cancel' );
            $scope.$destroy();
        };
    }
]);

'use strict';

function chartData( constants, backend, LimitTypes, $q ) {

    function Data() {
        this.resetVariables();
    }

    // static function. Takes an array of data and finds the unique y-values.
    // getValueFunc is passed an element of the data array, and should return the y-value
    Data.findUniqueVals = function( data, getValueFunc ) {
        // search through the data and find which values are present
        // this function would technically work fine on analog data but there is currently no use case for that
        var valKeys = {};
        data.forEach( function(point) {
            valKeys[ getValueFunc(point) ] = true;
        });
        // the values of the keys in valKeys now are associated with the unique y-values found in the data.
        return Object.keys( valKeys ).map( function(val) {
            return parseInt( val );
        }).sort(function(a,b) {
            return a-b;
        });
    };

    // static function. Takes an array of unique values and outputs where the y-axis breaks should be for discrete data.
    Data.calculateYAxisBreaks = function( uniqueVals ) {
        // ensure the array is sorted numerically
        uniqueVals.sort( function(a,b) {
            return a-b;
        });
        // discrete values are always integers. Create breaks that start and end between integers (at n.5).
        // this chops out the unused values while keeping the labels we want to see, and retaining an even spacing on the axis between the used values
        var yAxisBreaks = [];
        if ( uniqueVals.length > 1 ) {
            // the loop below intentionally starts at 1 instead of 0 because we need to refer to i-1
            for ( var i = 1; i < uniqueVals.length; i++ ) {
                // place an axis break between the values defined at i-1 and i
                // don't add an axis break if the values are consecutive integers
                if ( uniqueVals[i-1] + 1 === uniqueVals[i] ) {
                    continue;
                }
                yAxisBreaks.push({
                    from: uniqueVals[i-1] + 0.5,
                    to: uniqueVals[i] - 0.5
                });
            }
        }
        return yAxisBreaks;
    };

    // Parse an offset value into a number. The offset value can be either a number or a string (representing a time duration).
    Data.parseOffset = function( offsetVal ) {
        if ( typeof offsetVal === 'undefined' ) {
            return 0;
        } else if ( typeof offsetVal === 'number' ) {
            return offsetVal;
        } else {
            offsetVal = offsetVal.split(' ');
            var scalar = parseFloat( offsetVal[0] );
            var period = offsetVal[1];
            return moment.duration( scalar, period ).asMilliseconds();
        }
    };

    Data.prototype = {
        resetVariables: function() {
            this.rawData = [];              // the data as given to the setData function

            this.data = [];                 // data representing [x,y] values
            this.dataWithGaps = [];
            this.minMaxData = [];           // data representing [x,yMin,yMax] values
            this.minMaxDataWithGaps = [];
            this.minMaxDataCreatedFromLine = false;

            this.xName = '';
            this.yName = '';
            this.url = '';
            this.offset = 0;

            this.isFullResolution = undefined;
            this.numViolations = {
                red: undefined,
                yellow: undefined
            };
            this.metadata = [];
            this.seriesTypes = [];

            this.typeConversions = [];
            this.usedDiscreteVals = undefined;
            this.yAxisBreaks = undefined;

            this.error = false;
            this.gapThreshold = undefined;
            this.xRange = undefined;

            this.xIndex = -1;
            this.yIndex = -1;
            this.yMinIndex = -1;
            this.yMaxIndex = -1;
        },
        /**
         * @ngdoc method
         * @name setData
         * @methodOf chartData
         * @description
         * Initializes the chartData object with data and variable names. The data can represent a line series, a min/max series, or both a line and min/max series.
         *
         * @param {array} data An array of points. Each point is an array of numbers. I.e., `[[2,50],[3,54],[4,40]]`.
         *      For a line series, two values must be given for each point (`x` and `y`).
         *      For a min/max series, three values must be given for each point (`x`, `yMin`, and `yMax`).
         *      For a line & min/max series, four values must be given for each point (`x`, `y`, `yMin`, and `yMax`).
         *      The order of the values in each point does not matter, since it can be defined by the `indexes` parameter, however, the order must be the same for each point.
         * @param {array} [parameterNames] The names of the parameters, given in the same order as the values in each data point. I.e. `['Time', 'Temperature']`.
         * @param {array} [indexes=['x','y','yMin','yMax']] A definition of which values in each data point represent `x`, `y`, `yMin`, or `yMax`, given in the same order as the values in each data point.
         *      For example, if each data point contains `[min_temp, max_temp, avg_temp, time]`, you would define `indexes` as `['yMin', 'yMax', 'y', 'x']`.
         *      If left undefined, chartData assumes you're providing both a line and min/max series if each data point contains at least four values,
         *      and if each data point contains less than four values, it assumes you're providing a line series.
         *      If you're providing only a min/max series, you must define the `indexes` parameter.
         *      Note that this parameter allows you to ignore values passed in the data. If each data point contains `[time, temperature, pressure]` and you only want to plot
         *      time vs. pressure, you can define `indexes` as `['x', null, 'y']`.
         * @param {string} [linkURL] The URL to open when a series is clicked.
         * @param {string} [name] The name of the series. If left undefined, the name of the series is the value in `parameterNames` which corresponds to the index of `y` in `indexes`.
         *      For example, if `parameterNames` equals `['Time', 'Temperature']` and `indexes` equals `['x', 'y']`, then the series name is `Temperature`.
         *      This is the only way to set the series name for min/max series, since a min/max series doesn't define a `y` value.
         * @param {number} [offset=0] The x-offset that this dataset has or is expected to have compared to the plot's main x-range. For example, if the plot's main x-range is [10,20], and
         *      this dataset has a known or expected x-range of [110,120], the xOffset would be 100.
         *      The offset can be a numeric value, or a string representing a moment duration, formatted like below:
         *      '[s] [p]' : where [s] is a scalar, and [p] is a period of time--one of ['s','m','h','d','y'], representing [seconds,minutes,hours,days,years].
         */
        setData: function( data, parameterNames, indexes, linkURL, name, offset ) {
            this.resetVariables();
            this.rawData = data;
            this.offset = offset || 0;

            if ( data.length > 0 && data[0].length < 2 ) {
                throw 'Each data point must contain at least two values';
            }

            parameterNames = parameterNames || [];

            // if indexes is undefined, assume that the values of each data point are [x, y, yMin, yMax]
            if ( typeof indexes === 'undefined' ) {
                this.xIndex = 0,
                this.yIndex = 1;
                if ( data.length > 0 && data[0].length >= 4 ) {
                    this.yMinIndex = 2;
                    this.yMaxIndex = 3;
                }
            } else {
                // indexes must contain x,y or x,yMin,yMax, or x,y,yMin,yMax
                this.xIndex = indexes.indexOf('x');
                this.yIndex = indexes.indexOf('y');
                this.yMinIndex = indexes.indexOf('yMin');
                this.yMaxIndex = indexes.indexOf('yMax');
                if ( this.xIndex === -1 ) {
                    throw 'The index for x values must be defined';
                } else if ( this.yIndex + this.yMinIndex + this.yMaxIndex === -3 // none were defined
                        || this.yIndex === -1 && (this.yMinIndex === -1 || this.yMaxIndex === -1) ) {// yIndex isn't defined, and both min/max are not defined
                    throw 'At least the y index, or the yMin index and yMax index, must be defined';
                }
            }

            // Manipulate the x-value data if the offset is not 0.
            // This is done to put the dataset on the same x-axis and in the same range as the other datasets.
            var offsetVal = Data.parseOffset( this.offset );
            if ( offsetVal !== 0 ) {
                for ( var i = 0; i < this.rawData.length; i++ ) {
                    if ( typeof this.rawData[i][this.xIndex] === 'number' ) {
                        this.rawData[i][this.xIndex] -= offsetVal;
                    }
                }
            }

            // determine what kind of series this data contains
            if ( this.yIndex !== -1 ) {
                this.seriesTypes.push( 'line' );
            }
            if ( this.yMinIndex !== -1 && this.yMaxIndex !== -1 ) {
                this.seriesTypes.push( 'arearange' );
            }

            this.xName = parameterNames[this.xIndex];
            this.yName = name || parameterNames[this.yIndex];
            this.url = linkURL;
        },
        getLinkURL: function() {
            return this.url;
        },
        getData: function() {
            // return data that looks like [x,y] for each point
            var i;
            // generate the array if needed
            if ( this.data.length < 1 ) {
                if ( this.xIndex === 0 && this.yIndex === 1 ) {
                    this.data = this.rawData;
                } else {
                    for ( i = 0; i < this.rawData.length; i++ ) {
                        this.data[i] = [ this.rawData[i][this.xIndex], this.rawData[i][this.yIndex] ];
                    }
                }
            }
            return this.data;
        },
        getSeriesTypes: function() {
            return this.seriesTypes;
        },
        getError: function() {
            return this.error;
        },
        downloadData: function( accessURL, cancel, progressHandler, indexes, offset ) {
            // Generally, javascript callbacks, like here the $http.get callback,
            // change the value of the "this" variable inside it
            // so we need to keep a reference to the current instance "this" :
            this.error = false;
            var self = this;
            return backend.get( accessURL, cancel, progressHandler ).then( function( response ) {
                for ( var key in response.data ) {
                    if ( response.data.hasOwnProperty( key ) ) {
                        self.setData( response.data[key].data, response.data[key].parameters, indexes, undefined, undefined, offset );
                        var yName = self.yName;
                        var xName = self.xName;

                        var metadata = response.data[key].metadata;
                        var tempMetadata;
                        // format metadata from the server
                        if ( typeof metadata !== 'undefined' && typeof metadata[yName] !== 'undefined' ) {
                            tempMetadata = {
                                Name: yName,
                                Description: ( metadata[yName].long_name ? metadata[yName].long_name : undefined ),
                                IndependentVariable: {
                                    Name: xName,
                                    Alias: ( metadata[xName] && metadata[xName].alias ? metadata[xName].alias : undefined ),
                                    Units: ( metadata[xName] && metadata[xName].units ? metadata[xName].units : undefined ),
                                    Length: ( metadata[xName] && metadata[xName].length ? metadata[xName].length : undefined ),
                                    Type: ( metadata[xName] && metadata[xName].type ? metadata[xName].type : undefined )
                                },
                                Info: {
                                    tlmID: ( metadata[yName].tlmId ? metadata[yName].tlmId : undefined ),
                                    Alias: ( metadata[yName].alias ? metadata[yName].alias : undefined ),
                                    Units: ( metadata[yName].units ? metadata[yName].units : undefined )
                                }
                            };

                            // If limits exist, add Limits to the metadata object
                            if( metadata[yName].limits ) {
                                tempMetadata.Limits = {
                                        Yellow: {
                                            Low: metadata[yName].limits.yellow.low,
                                            High: metadata[yName].limits.yellow.high
                                        },
                                        Red: {
                                            Low: metadata[yName].limits.red.low,
                                            High: metadata[yName].limits.red.high
                                        }
                                    };
                            }
                            // If analog conversions exist, add to the metadata object
                            if( typeof metadata[yName].state_conversions !== 'undefined' ) {
                                // sort conversions by ascending numeric value
                                metadata[yName].state_conversions.sort( function(a,b) {
                                    return a.value - b.value;
                                });
                                self.typeConversions = metadata[yName].state_conversions;
                                tempMetadata['State Conversions'] = metadata[yName].state_conversions;
                            }

                            self.setMetadata( tempMetadata );
                        }

                        break;
                    }
                }
            }, function( response ) {
                var helptext = 'If the server is busy, please try again. If this problem persists, please contact webtcad.support@lasp.colorado.edu';
                if ( response.status === 502 ) {
                    self.error = {
                        message: 'Error 502: Proxy Timeout. ' + helptext,
                        code: 'Proxy Timeout'
                    };
                } else if ( response.status === 504 ) {
                    self.error = {
                        message: 'Error 504: Gateway Timeout. ' + helptext,
                        code: 'Gateway Timeout'
                    };
                } else if ( response.status === -1 ) {
                    // See this on status code -1: https://stackoverflow.com/questions/43666937/what-are-the-angular-http-request-status-codes-0-and-1
                    self.error = {
                        message: 'Error: unable to send HTTP request',
                        code: 'Request Failed'
                    };
                } else {
                    self.error = {
                        message: response.data ? response.data : 'Error: unknown',
                        code: 'LaTiS error'
                    };
                }
                self.error.status = response.status;
                // return a rejected promise so that further chained promise handlers will correctly execute the error handler
                return $q.reject( self );
            });
        },
        getTypeConversions: function() {
            return this.typeConversions;
        },
        getXName: function() {
            return this.xName;
        },
        getXNameAndUnits: function() {
            var returnVal = this.xName;
            try {
                if ( typeof this.metadata.IndependentVariable.Units !== 'undefined' ) {
                    returnVal += ' (' + this.metadata.IndependentVariable.Units + ')';
                }
            } catch ( e ) {
                // some part of this.metadata.Info was undefined. Just continue and return only the name.
            }
            return returnVal;
        },
        getYName: function() {
            return this.yName;
        },
        getYNameAndUnits: function() {
            var returnVal = this.yName;

            try {
                if ( typeof this.metadata.Info.Units !== 'undefined' ) {
                    returnVal += ' (' + this.metadata.Info.Units + ')';
                }
            } catch ( e ) {
                // some part of this.metadata.Info was undefined. Just continue and return only the name.
            }

            return returnVal;
        },
        getDescription: function() {
            return this.description;
        },
        getMetadata: function() {
            return this.metadata;
        },
        setMetadata: function(meta) {
            this.metadata = meta;
        },
        getXRange: function() {
            if ( this.rawData.length === 0 ) return;
            if ( !this.xRange ) {
                // get the minimum and maximum times contained in the data
                this.xRange = {
                    start: this.rawData[0][this.xIndex],
                    end: this.rawData[this.rawData.length-1][this.xIndex]
                };
            }
            return this.xRange;
        },
        getMinMaxData: function() {
            // return data that looks like [x,yMin,yMax] for each point
            var i;
            // generate the array if needed
            if ( this.minMaxData.length < 1 ) {
                if ( this.xIndex === 0 && this.yMinIndex === 1 && this.yMaxIndex === 2 ) {
                    this.minMaxData = this.rawData;
                } else {
                    for ( i = 0; i < this.rawData.length; i++ ) {
                        this.minMaxData[i] = [ this.rawData[i][this.xIndex], this.rawData[i][this.yMinIndex], this.rawData[i][this.yMaxIndex] ];
                    }
                }
            }
            return this.minMaxData;
        },
        getDataWithGaps: function( threshold ) {
            this.generateDataWithGaps( threshold );
            return this.dataWithGaps;
        },
        getMinMaxDataWithGaps: function( threshold ) {
            this.generateDataWithGaps( threshold );
            return this.minMaxDataWithGaps;
        },
        generateDataWithGaps: function( threshold ) {

            // if the threshold parameter that was passed is the same as it was last time, don't bother recalculating all this
            if ( threshold === this.gapThreshold ) {
                return;
            }

            this.gapThreshold = threshold;

            // run the getData and getMinMaxData methods so those arrays are generated, if they haven't been generated already
            this.getData();
            this.getMinMaxData();

            if ( this.rawData.length < 4 ) {
                // if the array is this short, there's not enough info to calculate where gaps are
                this.dataWithGaps = this.data;
                this.minMaxDataWithGaps = this.minMaxData;
                return;
            }

            // leave the original data arrays alone, and generate new data arrays
            this.dataWithGaps = [];
            this.minMaxDataWithGaps = [];

            // loop through the data array to find where gaps should be inserted, and insert null points into data and minMaxData
            // If the interval between two points is significantly greater than both of the adjacent intervals, then insert a null point in that interval.
            // End the loop 3 short of the end of the array, because we need to look at three intervals at a time, which involves 4 points at a time (looking 3 points ahead).
            var interval1, interval2, interval3;

            for ( var i = 0; i < this.rawData.length -3; i++ ) {
                if ( typeof interval1 === 'undefined' ) {
                    interval1 = this.rawData[i+1][this.xIndex] - this.rawData[i][this.xIndex];
                    interval2 = this.rawData[i+2][this.xIndex] - this.rawData[i+1][this.xIndex];
                } else {
                    // reuse a couple of the intervals that we calculated last time
                    // as we move one step to the right, intervals 2  and 3 from last time become intervals 1 and 2, respectively
                    interval1 = interval2;
                    interval2 = interval3;
                }
                interval3 = this.rawData[i+3][this.xIndex] - this.rawData[i+2][this.xIndex];

                // push the second point out of the four we're looking at onto the new arrays
                // we might insert a null between the 2nd and 3rd points, so we don't want to insert the 3rd or 4th points yet (we will at the next loop iteration)
                this.dataWithGaps.push( this.data[i+1] );
                this.minMaxDataWithGaps.push( this.minMaxData[i+1] );

                // compare the center interval with its adjacent intervals.
                // In order for a gap to appear, the center interval must be larger than threshold times the largest of the adjacent intervals
                if ( interval2 > threshold * Math.max(interval1, interval3) ) {
                    var midpointTimestamp = ( this.rawData[i+1][this.xIndex] + this.rawData[i+2][this.xIndex] ) / 2;
                    this.dataWithGaps.push( [midpointTimestamp, null] );
                    this.minMaxDataWithGaps.push( [midpointTimestamp, null, null] );
                }
            }

            // copy the first data point and last two data points to the new array, because they weren't inserted during the loop
            var dataLength = this.rawData.length;
            var minMaxDataLength = this.minMaxData.length;
            this.dataWithGaps.unshift( this.data[0] );
            this.minMaxDataWithGaps.unshift( this.minMaxData[0] );
            this.dataWithGaps.push( this.data[dataLength-2], this.data[dataLength-1] );
            this.minMaxDataWithGaps.push( this.minMaxData[minMaxDataLength-2], this.minMaxData[minMaxDataLength-1] );
        },
        // takes a line series and turns it into a min/max series,
        // with both the min and the max equalling the y-value of the line series.
        // Returns false if the data does not contain a line series, or if it already contains an arearange series.
        // Returns true on success.
        createMinMaxDataFromLine: function() {
            if ( this.seriesTypes.indexOf('line') === -1 || this.seriesTypes.indexOf('arearange') !== -1 || typeof this.rawData[0] === 'undefined' ) {
                return false;
            }
            // alter the raw data, creating min/max data.
            this.yMinIndex = this.rawData[0].length;
            this.yMaxIndex = this.yMinIndex + 1;
            for ( var i = 0; i < this.rawData.length; i++ ) {
                this.rawData[i][this.yMinIndex] = this.rawData[i][this.yMaxIndex] = this.rawData[i][this.yIndex];
            }
            this.minMaxDataCreatedFromLine = true;
            // add the series type, now that we've got a new one
            this.seriesTypes.push( 'arearange' );
        },
        removeMinMaxDataCreatedFromLine: function() {
            if ( this.minMaxDataCreatedFromLine ) {
                // remove the data from rawData
                for ( var i = 0; i < this.rawData.length; i++ ) {
                    delete this.rawData[i][this.yMinIndex];
                    delete this.rawData[i][this.yMaxIndex];
                }
                // Since there's no longer a min/max series, clear any associated data
                this.yMinIndex = -1;
                this.yMaxIndex = -1;
                this.minMaxData = this.minMaxDataWithGaps = [];
                this.seriesTypes.splice( this.seriesTypes.indexOf('arearange'), 1 );
                this.minMaxDataCreatedFromLine = false;
            }
        },
        getLength: function() {
            return this.rawData.length;
        },
        checkLimitViolations: function() {
            var self = this;
            var metadata = this.metadata;
            var redLow = metadata.Limits ? metadata.Limits.Red.Low : undefined;
            var redHigh = metadata.Limits ? metadata.Limits.Red.High : undefined;
            var yellowLow = metadata.Limits ? metadata.Limits.Yellow.Low : undefined;
            var yellowHigh = metadata.Limits ? metadata.Limits.Yellow.High : undefined;

            var state_conversions = ( typeof metadata['State Conversions'] === 'undefined' ) ? null : metadata['State Conversions'];

            // for discrete datasets
            if ( state_conversions ) {
                countLimitViolations( function( point ) {
                    // return a limit type based on if this data point violates any of the defined limits
                    var state_conversion = state_conversions.find( function( state_conversion ) {
                        return state_conversion.value === point[self.yIndex];
                    });

                    if ( !state_conversion ) {
                        return; // no conversion available; return undefined.
                    } else if ( state_conversion.desirability === 'BAD' ) {
                        return LimitTypes.BAD;
                    } else if ( state_conversion.desirability === 'CAUTION' ) {
                        return LimitTypes.WARN;
                    } else {
                        return LimitTypes.GOOD;
                    }
                });
            }
            // for analog datasets
            else if ( typeof redLow !== 'undefined' && typeof redHigh !== 'undefined' && typeof yellowLow !== 'undefined' && typeof yellowHigh !== 'undefined' ) {
                countLimitViolations( function( point ) {
                    var y = point[self.yIndex];
                    var yMin = self.yMinIndex === -1 ? y : point[self.yMinIndex];
                    var yMax = self.yMaxIndex === -1 ? y : point[self.yMaxIndex];

                    // return a limit type based on if this data point violates any of the defined limits
                    if ( yMin > yellowLow && yMax < yellowHigh ) {
                        return LimitTypes.GOOD;
                    }
                    // If the min or max value of the data point is in a yellow limit range, return warning limit violation
                    else if ( (yMin <= yellowLow && yMin > redLow) || (yMax >= yellowHigh && yMax < redHigh) ) {
                        return LimitTypes.WARN;
                    }
                    // If the min or max of the data point is outside red limits, return bad limit violation
                    else if ( yMin <= redLow || yMax >= redHigh ) {
                        return LimitTypes.BAD;
                    }
                });
            }

            function countLimitViolations( limitCheckFn ) {
                // count number of limit violations in a dataset.
                // limitCheckFn should take a data point as a parameter and return either LimitTypes.GOOD, LimitTypes.WARN, or LimitTypes.BAD
                //    based on whether that point violates any limits
                //    or return undefined if limit information is not available
                self.numViolations.yellow = 0;
                self.numViolations.red = 0;
                var filteredData = self.rawData.filter( function( point ) { return point[self.yIndex] !== null; });

                filteredData.forEach( function( point ) {
                    var limitState = limitCheckFn( point );
                    switch( limitState ) {
                        case LimitTypes.WARN:
                            self.numViolations.yellow++;
                            break;
                        case LimitTypes.BAD:
                            self.numViolations.red++;
                            break;
                        default: ;
                    }
                });
            }
        },
        getLimitZones: function( greenColor, yellowColor, redColor ) {
            // create y-value color zones that highstock can understand
            var zones = [];
            var stateConversions = this.metadata['State Conversions'];
            if ( typeof this.metadata.Limits !== 'undefined' ) {
                zones = [{
                    // from -Infinity to Red.Low
                    value: this.metadata.Limits.Red.Low,
                    color: redColor
                }, {
                    // from Red.Low to Yellow.Low
                    value: this.metadata.Limits.Yellow.Low,
                    color: yellowColor
                }, {
                    // from Yellow.Low to Yellow.High
                    value: this.metadata.Limits.Yellow.High,
                    color: greenColor
                }, {
                    // from Yellow.High to Red.High
                    value: this.metadata.Limits.Red.High,
                    color: yellowColor
                }, {
                    // from Red.High to Infinity
                    // no "value" means Infinity
                    color: redColor
                }];
            } else if ( typeof stateConversions !== 'undefined' ) {
                // state conversions are already sorted by ascending y-value
                var zoneWidth = 0.05;
                stateConversions.forEach( function(conversion) {
                    var color = conversion.desirability === 'GOOD' ? greenColor :
                                conversion.desirability === 'CAUTION' ? yellowColor :
                                conversion.desirability === 'BAD' ? redColor :
                                undefined;
                    if ( color !== undefined ) {
                        // create a zone right around this single value
                        zones.push({
                            // from the previous value to right below this conversion's value
                            value: conversion.value - zoneWidth
                            // no color means default series color
                        });
                        zones.push({
                            // from right below this conversion's value to right above it
                            value: conversion.value + zoneWidth,
                            color: color
                        });
                    }
                });
                zones.push({
                    // from the previous zone definition to Infinity, use the default series color
                    // (this is done by giving it an empty object with no defined color or value)
                });
            }

            return zones;
        },
        checkFullResolution: function() {
            if ( typeof this.isFullResolution === 'undefined' ) {
                // we haven't yet calculated whether the data is full res. Check now.

                this.isFullResolution = true; // true until proven false

                for ( var i = 0; i < this.rawData.length; i++ ) {
                    if ( this.rawData[i][this.yMinIndex] !== this.data[i][this.yMaxIndex] ) {
                        this.isFullResolution = false;
                        break;
                    }
                }
            }
            return this.isFullResolution;
        },
        getYAxisBreaks: function() {
            if ( typeof this.yAxisBreaks === 'undefined' ) {
                this.yAxisBreaks = Data.calculateYAxisBreaks( this.getUsedDiscreteVals() );
            }
            return this.yAxisBreaks;
        },
        getUsedDiscreteVals: function() {
            if ( typeof this.usedDiscreteVals === 'undefined' ) {
                var self = this;
                this.usedDiscreteVals = Data.findUniqueVals( this.rawData, function(element) {
                    return element[self.yIndex];
                });
            }
            return this.usedDiscreteVals;
        }
    };
    return( Data );
}

angular.module( 'laspChart' ).factory( 'ChartData', [ 'constants', 'latis', 'LimitTypes', '$q', chartData ]);
'use strict';

function eventsData( backend, $q ) {

    function Data() {
        // A list of event type id's and labels. The index of each element equates to the y-value of the event type on the chart.
        // Each element in the array has the following properties:
        //   id: {int} An ID number for this event type
        //   name: {string} An description of the event type
        //   label: {string} A shortened description of 'name'
        this.types = [];
        // An array of events in the loaded data. Each element should be an object with the following properties:
        //   type: {object} An event type object, as described above.
        //   y: {int} The y-value of the event, which is also the index of the type string in the types array.
        //            This information is duplicated, but it makes other parts of the code very convenient
        //   start: {int} The start time of the event, in ms since 1970.
        //   end: {int} The end time of the event, in ms since 1970.
        //   info: {object} properties and values which give additional information about the event.
        this.events = [];

        this.error = false;
    }

    Data.prototype = {

        downloadData: function( accessURL, cancel, progressHandler ) {
            this.error = false;
            this.types = [];
            this.events = [];
            // Generally, javascript callbacks, like here the $http.get callback,
            // change the value of the "this" variable inside it
            // so we need to keep a reference to the current instance "this" :
            var self = this;
            return backend.get( accessURL, cancel, progressHandler ).then( function( response ) {
                // parse data
                // find indexes of parameters based on metadata
                var parameters = response.data.Events.parameters;
                var idIndex = parameters.indexOf( 'id' ),
                    typeIdIndex = parameters.indexOf( 'typeId' ),
                    startIndex = parameters.indexOf( 'startTime' ),
                    endIndex = parameters.indexOf( 'endTime' );

                // Get the list of unique event types returned by the metadata.
                // This should be a list of all possible event types.
                self.types = response.data.Events.metadata.typeId.event_types;

                // now build a list of events
                self.events = response.data.Events.data.map( function(event) {
                    var eventTypeIndex = self.types.findIndex( function(type) {
                        return event[typeIdIndex] === type.id;
                    });
                    return {
                        type: self.types[eventTypeIndex],
                        y: eventTypeIndex,
                        start: event[startIndex],
                        end: event[endIndex],
                        info: {
                            'Event ID': event[idIndex].toString()
                        }
                    };
                });

            }, function( response ) {
                self.error = response;
                // return a rejected promise so that further chained promise handlers will correctly execute the error handler
                return $q.reject( response.data );
            });
        }
    };

    return( Data );
}

angular.module( 'laspChart' ).factory( 'EventsData', [ 'latis', '$q', eventsData ]);
'use strict';
angular.module( 'laspChart' ).controller( 'eventsModalCtrl', [
    '$uibModalInstance',
    'eventDetails',
    'timeLabelsOptions',
    function( $uibModalInstance, eventDetails, timeLabelsOptions ) {
        /**
         * @ngdoc service
         * @name eventsModalCtrl
         * @requires $uibModalInstance
         * @description
         * Modal controller for viewing details of an event
         */

        var $ctrl = this;
        $ctrl.eventDetails = eventDetails;

        // make an array of properly formatted dates-
        // the start date (index 0) and end date (index 1)
        var dates = [eventDetails.start, eventDetails.end].map( function(date) {
            date = moment.utc( new Date(date) );
            date.tz( timeLabelsOptions.timezone );
            return date.format( timeLabelsOptions.momentTimeFormat + 'THH:mm:ss' );
        });
        $ctrl.eventDetails.startFormatted = dates[0];
        $ctrl.eventDetails.endFormatted = dates[1];
    }
]);

'use strict';

function trackerFactory() {

    function LoadingProgressTracker( startTime, endTime, progressCallback, dataType ) {
        this.percent = 0;
        this.kb = 0;
        this.startTime = startTime;
        this.endTime = endTime;
        this.timeRangeIsValid = !isNaN( startTime ) && !isNaN( endTime );
        this.progressCallback = progressCallback || angular.noop;
        this.dataType = dataType || LoadingProgressTracker.dataTypes.dataset;

        // when onProgress is called, the value if 'this' ends up being Window rather than the instance of the
        // LoadingProgressTracker object, which is why we have to use this method to call the prototype method
        var self = this;
        this.onProgress = function( evt ) {
            self.onProgressHandler( evt );
        };
    }

    LoadingProgressTracker.dataTypes = {
        dataset: 1,
        events: 2
    };

    LoadingProgressTracker.prototype.onProgressHandler = function( evt ) {
        // Track the total kb loaded
        this.kb = Math.round( evt.loaded / 1024 );

        this.percent = null;
        if ( evt.lengthComputable ) {
            // If the server sent the total number of bytes in the request, compute the percent based on that
            this.percent = 100 * evt.loaded / evt.total;
        } else if ( this.timeRangeIsValid ) {
            // If latis doesn't know the total amount of data it will send, we can get the latest timestamp sent
            // and compare that to the range of data that was requested. There can be data gaps or varying data
            // cadences, so this isn't always an accurate representation of the percent of data loaded, but it's
            // better than nothing.

            // We need to get the last instance of something that looks like "[1481439764570,". This should be the
            // farthest timestamp loaded so far. There's no function to perform a regex search from the end of a
            // string, and we don't want to perform a regex search on the whole response in order to find only the
            // last match (the response could be on the order of many MB), so we'll search backwards until we find
            // a matching pattern, but we'll limit our search to 10,000 characters.

            var responseText = evt.target.responseText; // shorthand
            var responseLength = responseText.length;
            // max index of 0 in case the response is under 10000 characters
            var searchLimit = Math.max( responseLength - 10000, -1 );
            var index = responseLength;
            var match = null;

            // search from the end of the string to find '['
            while (
              match == null
              // if '[' is the first character of the string, lastIndexOf will never return -1, despite the value of
              // its second parameter. The condition below catches the case where we're already searched through the
              // entire string
              && index > 0
              // jump to the next instance of '[' closer to the beginning of the string
              && (index = responseText.lastIndexOf('[', index-1)) > searchLimit ) {
                if ( this.dataType === LoadingProgressTracker.dataTypes.dataset ) {
                    // regex search for a string that looks like "[12345," or "[-12345,". Only match at the beginning
                    // of the substring, because by the nature of how we're searching, we've already searched through
                    // the rest of the string.
                    match = responseText.substring( index ).match(/^\[-?\d+,/);
                } else if ( this.dataType === LoadingProgressTracker.dataTypes.events ) {
                    // events data returns arrays with the parameters [id, typeId, startTime, endTime] and we
                    // want to get the value of startTime
                    match = responseText.substring( index ).match(/^\[\d+,\d+,(\d+),/);
                } else {
                    // something wrong... the dataType wasn't set right.
                    return;
                }

            }

            if ( match !== null ) {
                var latestTimestamp;
                if ( this.dataType === LoadingProgressTracker.dataTypes.dataset ) {
                    // chop the first and last characters off the string ("[" and ",") and parse it as an integer
                    latestTimestamp = parseInt( match[0].substr( 1, match[0].length-2 ) );
                } else if ( this.dataType === LoadingProgressTracker.dataTypes.events ) {
                    // get the number matched by parens and parse as an int
                    latestTimestamp = parseInt( match[1] );
                    // the latest timestamp can be before the start time if the server returned an event
                    // which started before this.startTime, but ends either during or after our requested time range
                    if ( latestTimestamp < this.startTime ) {
                        latestTimestamp = null;
                    }
                }

                if ( latestTimestamp !== null ) {
                    this.percent = 100 * ( latestTimestamp - this.startTime ) / ( this.endTime - this.startTime );
                }
            }
        }

        this.progressCallback();
    };

    return LoadingProgressTracker;
}

angular.module( 'laspChart' ).factory( 'LoadingProgressTracker', [ trackerFactory ]);
'use strict';

angular.module( 'constants', [] )
  .service('constants', [function() {
  return {
      // Plot options:
      DEFAULT_PLOT_HEIGHT: 400,
      DEFAULT_LINE_COLOR: '#FF0000',
      DEFAULT_LINE_WIDTH: 1.2,
      DEFAULT_COLOR_THEME: 'light',

      NAVIGATOR_HEIGHT: 40,
      NAVIGATOR_MARGIN: 25,
      /* by default, the y axis label will look something like:
       *   Irradiance (W/m^2)
       * If the following value is true, the label will look like:
       *   W/m^2
       */
      Y_AXIS_LABEL_SHOW_UNITS_ONLY: false,
      // Zoom ratios for setting how far the zoom in/out buttons zoom
      ZOOM_OUT_RATIO: 3/2,
      ZOOM_IN_RATIO: 2/3,
      // Ratios for setting how far the pan left/right buttons pan
      PAN_LEFT_RATIO: -2/3,
      PAN_RIGHT_RATIO: 2/3,

      MINIMUM_RANGE: 30 * 1000, // 30 seconds

      VIOLATION_ZINDEX: 3, // a value of 3 keeps the violations under the selection area in the navigator
      LIMIT_VIOLATION_LINE_WIDTH: 3,
      MILLISECONDS_PER_MINUTE: 60 * 1000,
      // In search modal, minimum number of characters at which to apply filters
      MIN_SEARCH_CHARACTERS: 3,

      // data grouping can speed up the UI when large amounts of data are loaded
      // this value can be changed for individual plots by setting menuOptions.dataDisplay.dataGrouping
      DEFAULT_DATA_GROUPING: true,

      EXPORTING: true
  };
}]);

'use strict';

function plotMenuDirective( $window ) {
    return {
        restrict: 'A',
        scope: {
            open: '=',
            menuBtn: '='
        },
        link: function( scope, element, attr ) {
            var el = element[0]; // convenience variable to access the HTMLElement instead of the jqLite object

            // get the default offset values for the element.
            var defaultTop = el.offsetTop;
            var defaultLeft = el.offsetLeft;


            // find the nearest scrolling ancestor
            function findNearestScrollingAncestor() {
                var scrollElement = element.parent();
                while ( scrollElement[0] !== document.body && scrollElement !== null && typeof scrollElement !== 'undefined' ) {
                    // find out if it scrolls by setting scrollTop to a number greater than 0 and getting the value again
                    // once Element.scrollTopMax or something like it has been standardized, we can use that instead.
                    var originalScrollTop = scrollElement[0].scrollTop;
                    scrollElement[0].scrollTop = 1;
                    if ( scrollElement[0].scrollTop > 0 ) {
                        // reset the scroll value and break since we've found our scrolling container
                        scrollElement[0].scrollTop = originalScrollTop;
                        break;
                    }
                    scrollElement = scrollElement.parent();
                }
                return scrollElement;
            }


            element.on( 'click', function( event ) {
                event.clickedPlotMenu = true; // used for not closing the menu when the menu is clicked on
            });

            element.find( 'li' ).on( 'mouseenter', function( event ) {
                var childUl = angular.element(this).find('ul')[0];

                if ( typeof childUl !== 'undefined' ) {
                    var scrollElement = findNearestScrollingAncestor();
                    var scrollElementBoundingRect = scrollElement[0].getBoundingClientRect();
                    // reset styles which are possible altered
                    childUl.style.top = '0';
                    childUl.style.height = 'auto';
                    childUl.style.overflowY = '';
                    var $childUl = angular.element( childUl );
                    $childUl.removeClass( 'open-left' );

                    var boundingRect = childUl.getBoundingClientRect();

                    if ( boundingRect.height > $window.innerHeight && $childUl.hasClass( 'scrolling-menu' ) ) {
                        // set the height of the element to equal the height of the nearest scrolling ancestor, and add a scroll bar to the ul
                        childUl.style.height = scrollElement[0].offsetHeight + 'px';
                        childUl.style.overflowY = 'scroll';
                        // re-get the bounding rect since we've changed the height
                        boundingRect = childUl.getBoundingClientRect();
                    }

                    var bottomDiff = scrollElementBoundingRect.bottom - boundingRect.bottom + window.pageYOffset;
                    // adjust the height of the element so it doens't disappear below the bottom of the nearest scrolling ancestor
                    if ( bottomDiff < 0 ) {
                        childUl.style.top = bottomDiff + 'px';
                    }
                    // if the element hangs off the right side of the screen, move it to the left
                    if ( $window.innerWidth < boundingRect.right ) {
                        $childUl.addClass( 'open-left' );
                    }
                }
            });

            scope.$watch( 'open', function( newVal, oldVal ) {
                el.style.display = ( newVal ) ? 'block' : 'none';

                if ( newVal ) {
                    // the menu has just been opened
                    var scrollElement = findNearestScrollingAncestor();
                    var scrollElementBoundingRect = scrollElement[0].getBoundingClientRect();
                    var boundingRect = el.getBoundingClientRect();
                    var bottomDiff = scrollElementBoundingRect.bottom - boundingRect.bottom + window.pageYOffset;

                    // when the menu is opened, make sure the bottom of the menu doesn't fall off the bottom of the browser window
                    // don't bother adjusting the position of the menu if the menu is taller than the containing element
                    if ( bottomDiff < 0 && boundingRect.height <= scrollElementBoundingRect.height ) {
                        // if the menu button is defined, find the width so we can move the menu to the right of the button
                        // this assumes that the menu normally opens directly below the button, and that the left side of the button and menu are aligned
                        if ( typeof scope.menuBtn !== 'undefined' ) {
                            el.style.left = scope.menuBtn.offsetWidth + scope.menuBtn.offsetLeft + defaultLeft + 'px';
                        }
                        // move the menu up so the bottom of the menu is aligned with the bottom of the screen
                        el.style.top = bottomDiff + defaultTop + 'px';
                    }
                } else {
                    // reset the position of the menu to the default values
                    el.style.top = defaultTop + 'px';
                    el.style.left = defaultLeft + 'px';
                }
            });
        }
    };
}

angular.module( 'laspChart' ).directive( 'plotMenu', ['$window', plotMenuDirective] );
(function() { // IIFE

'use strict';

/**
 * @ngdoc service
 * @name ColorThemes
 *
 * @description
 * Definition of multiple color themes available to plots.
 */
function colorThemesFactory () {

    var ColorThemes = {};

    ColorThemes.themes = {
        light: {
            colors: ['#2885e0', '#383838', '#d7792a', '#4b32c9', '#4eb7a7', "#db0a5b", "#806c00", "#008000", "#f45b5b", "#b381b3"], // use a darker color scheme than the default
            backgroundColor: '#ffffff',
            selectionMarkerFill: 'rgba(69,114,167,0.25)',
            axis: {
                gridLineColor: 'rgba(0,0,0,0.15)',
                lineColor: '#c0d0e0',
                minorGridLineColor: '#e0e0e0',
                minorTickColor: '#a0a0a0',
                tickColor: '#c0d0e0',
                crosshairColor: '#c0c0c0',
                labelStyle: {color: '#555555'}
            },
            navigator: {
                outlineColor: '#b2b1b6',
                maskFill: 'rgba(128,179,236,0.2)',
                handles: {
                    backgroundColor: '#ebe7e8',
                    borderColor: '#b2b1b6'
                }
            },
            legend: {
                itemStyle: {color: '#333333'},
                titleStyle: {color: '#000000'}
            },
            events: {
                colors: {
                    // the 'regular' event series colors are mostly the same as the main series colors for the dark color theme,
                    // minus colors that are reserved for specific kinds of events.
                    // The colors below are defined in numeric RGB values. The CSS-friendly "rgba(r,g,b,a)" strings are built in a function,
                    // so that event series, plot lines, and plot bands can all easily share the same color value but have different opacities.
                    regular: [ [101,225,206], [200,190,60], [245,93,129], [207,118,245], [240,113,62], [116,183,250] ],
                    shadow: [153,153,153],
                    contact: [118,213,99]
                },
                plotLineOpacity: 0.5,
                plotBandOpacity: 0.3
            },
            limits: {
                bands: {
                    warn: 'rgba(223, 223, 0, 0.2)',
                    bad: 'rgba(255, 0, 0, 0.08)'
                },
                zones: {
                    good: '#33ae1a',
                    warn: '#c6ba02',
                    bad: '#c70202'
                }
            }
        },
        dark: {
            colors: ['#74b7fa', '#c1c1c1', '#f08e3e', '#ac9ef4', '#65e1ce', "#f15c80", "#9f6b3f", "#6b8e23", "#f45b5b", "#e4d354"],
            backgroundColor: '#000000',
            selectionMarkerFill: 'rgba(88,133,186,0.25)',
            axis: {
                gridLineColor: 'rgba(255,255,255,0.2)',
                lineColor: '#4f5f6f',
                minorGridLineColor: '#1f1f1f',
                minorTickColor: '#5f5f5f',
                tickColor: '#1f2f3f',
                crosshairColor: '#5f5f5f',
                labelStyle: {color: '#d0d0d0'}
            },
            navigator: {
                outlineColor: '#4a494e',
                maskFill: 'rgba(128,179,236,0.3)',
                handles: {
                    backgroundColor: '#b2b1b6',
                    borderColor: '#4a494e'
                }
            },
            legend: {
                itemStyle: { color: '#cccccc' },
                titleStyle: { color: '#ffffff' }
            },
            events: {
                colors: {
                    // See the notes on the events colors for the light color theme.
                    regular: [ [78,183,167], [185,175,15], [199,53,88], [144,81,209], [215,121,42], [40,133,224] ],
                    shadow: [156,156,156],
                    contact: [51,174,26]
                },
                plotLineOpacity: 0.55,
                plotBandOpacity: 0.3
            },
            limits: {
                bands: {
                    warn: 'rgba(255, 255, 0, 0.2)',
                    bad: 'rgba(255, 0, 0, 0.25)'
                },
                zones: {
                    good: '#46d754',
                    warn: '#f0e546',
                    bad: '#e42929'
                }
            }
        }
    };

    // takes a color theme object and returns the opposite theme.
    ColorThemes.getOppositeTheme = function( theme ) {
        return angular.equals( theme, ColorThemes.themes.light ) ? ColorThemes.themes.dark : ColorThemes.themes.light;
    };

    ColorThemes.getColorForEventType = function( eventType, allEventTypes, colorTheme ) {
        // there are some special colors to use for certain event types. Otherwise, just get a color from the default event color list.
        // Return colors for series, plot line, and plot band
        if ( eventType.label.toLowerCase().indexOf('shadow') !== -1 ) {
            var rgbColor = colorTheme.events.colors.shadow;
        } else if ( eventType.label.toLowerCase().indexOf('contact') !== -1 ) {
            rgbColor = colorTheme.events.colors.contact;
        } else {
            // get the index of the event type in the master list of event types
            var index = allEventTypes.findIndex( function(type) {
                return type.id === eventType.id;
            });
            // get the color corresponding to the index of the event type
            var eventColors = colorTheme.events.colors.regular;
            rgbColor = eventColors[ index % eventColors.length ];
        }
        var rgbColorString = rgbColor.join(',');
        return {
            series: 'rgb(' + rgbColorString + ')',
            line: 'rgba(' + rgbColorString + ', ' + colorTheme.events.plotLineOpacity + ')',
            band: 'rgba(' + rgbColorString + ', ' + colorTheme.events.plotBandOpacity + ')'
        };
    };

    return ColorThemes;
}

angular.module( 'laspChart' ).factory( 'ColorThemes', [ colorThemesFactory ]);

})(); // End IIFE

'use strict';

angular.module( 'laspChart' ).factory( 'HighstockOptions', [
    'DatasetTypes',
    'ChartData',
    'Logger',
    function ( DatasetTypes, ChartData, Logger ) {

        // create a new class, passing in a highstock adapter (Chart) object
        function HighstockOptions( highstockAdapter ) {
            // create some default options, which don't ever change
            return {
                chart: {
                    animation: false,
                    renderTo: null,
                    resetZoomButton: {
                        theme: {}
                    }
                },
                credits: {
                    enabled: false
                },
                exporting: {
                    enabled: false, // hide the default highcharts exporting menu
                    fallbackToExportServer: false,
                    chartOptions: {
                        legend: {
                            labelFormat: '{name}'
                        }
                    }
                },
                legend: {
                    enabled: false,
                    labelFormatter: function() {
                        var styledSeriesName = '<span style="color:' + this.color + '">' + this.name + '</span>';

                        //if there's no data just return a hyphen (returning nothing can mess with the legend height calculation)
                        if ( typeof this.point === 'undefined' || this.point.series === null ) {
                            return '-';
                        }
                        //Show this for hidden series
                        if ( !this.visible ) {
                            return styledSeriesName + ': disabled';
                        }
                        //This happens when no points are hovered, show name but no value
                        if ( angular.equals(this.point, {}) ) {
                            return styledSeriesName;
                        }

                        var point = this.point;

                        // auto-hide the range series in the legend when it's only showing info on a single full-res data point
                        if ( point.series.name === 'range'
                        && highstockAdapter.callbacks.dataIsFullRes()
                        && ( typeof point.dataGroup !== 'undefined' && point.dataGroup.length === 1 || typeof point.dataGroup === 'undefined' )
                        && point.low === point.high ) {
                            return '-';
                        }

                        if ( !highstockAdapter.showSingleLegendXValue && this.point.series.name !== 'range' ) {
                            // Show an x-value next to each series name in the legend, instead of having one x-value for the entire legend.
                            // But don't show a separate x-value for each range series.
                            var seriesIndex = this.chart.series.indexOf( this.point.series );
                            var xOffset = ChartData.parseOffset( seriesIndex === -1 ? 0 : highstockAdapter.seriesOffsets[ seriesIndex ] );
                            styledSeriesName = highstockAdapter.generateXLegendString( this.point, xOffset ) + ' ' + styledSeriesName;
                        }
                        var conversions = highstockAdapter.callbacks.getTypeConversions();
                        if ( conversions ) {
                            for ( var i = 0; i < conversions[0].length; i++ ) {
                                if ( conversions[0][i].value === point.y ) {
                                    point.stateLabel = conversions[0][i].state;
                                }
                            }
                        }
                        // Sometimes this length can go extremely negative, this checks to make sure its a valid value for .toFixed()
                        var tooltipDecimalLength = ( highstockAdapter.tooltipDecimalLength < 0 ) ? -1 : highstockAdapter.tooltipDecimalLength;
                        var s = styledSeriesName + ': ';

                        if ( typeof point.low !== 'undefined' && point.low !== null && typeof point.high !== 'undefined' && point.high !== null ) {
                            // Make sure the decimals are rounded to the correct precision
                            s += point.low.toFixed( tooltipDecimalLength + 1 )
                                    + ' - '
                                    + point.high.toFixed( tooltipDecimalLength + 1 );
                        } else if ( point.y !== null ) {
                            if ( point.stateLabel ) {
                                s += ' State: ' + point.stateLabel + ' (DN: ' + point.y + ')';
                            } else {
                                if ( point.y.toString().indexOf('e') !== -1 ) { // If scientific notation
                                    // Make sure the decimal is rounded to the correct precision
                                    s += ' ' + point.y.toExponential( tooltipDecimalLength + 1 );
                                } else {
                                    // Make sure the decimal is rounded to the correct precision
                                    s += ' ' + point.y.toFixed( tooltipDecimalLength + 1 );
                                }
                                // if we're not at full resolution, or this value represents a data group, add an indication that this is an average value
                                if ( !highstockAdapter.callbacks.dataIsFullRes() || typeof point.dataGroup !== 'undefined' && point.dataGroup.length > 1 ) {
                                    s += ' (avg)';
                                }
                            }
                        } else {
                            throw "Error: point type unrecognized for legend label formatter: " + point;
                        }

                        return s;
                    },
                    title: {
                        text: ' '
                    },
                    padding: 0,
                    margin: 0,
                    align: 'left',
                    verticalAlign: 'top'
                },
                loading: {
                    enabled: true
                },
                navigator: {
                    adaptToUpdatedData: false,
                    xAxis: {
                        labels: {}
                    }
                },
                plotOptions: {
                    line: {
                        cursor: 'default',
                        dataGrouping: {
                            groupPixelWidth: 1
                        },
                        marker: {
                            radius: 2
                        }
                    },
                    arearange: {
                        cursor: 'default',
                        fillOpacity: 0.35,
                        lineWidth: 0,
                        dataGrouping: {
                            groupPixelWidth: 1
                        }
                    },
                    polygon: {
                        // polygon is used for events
                        cursor: 'pointer',
                        linecap: 'square',
                        showInLegend: false,
                        yAxis: 1
                    },
                    series: {
                        connectNulls: false,
                        softThreshold: false,
                        states: {
                            hover: {
                                enabled: false
                            }
                        },
                        cursor: 'pointer',
                        events: {
                            click: function() {
                                // when click event is defined for plotOptions.series, the click event doesn't fire for plotOptions.[anythingElse],
                                // so we have to check for different series types here
                                if ( this.options.type === 'polygon' ) {
                                    highstockAdapter.callbacks.onSpacecraftEventClick( this.options.eventDetails );
                                } else {
                                    highstockAdapter.callbacks.onSeriesClick( this.options.url );
                                }
                            }
                        },
                        dataGrouping: {
                            // The units are mostly the same as the defaults, except without 'week' and a few more values thrown in.
                            // The extra values make it so that the actual pixel width of each group will be closer to 1 more often than otherwise.
                            units: [
                            [ 'millisecond', [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500] ],
                            [ 'second', [1, 2, 4, 5, 10, 15, 20, 30] ],
                            [ 'minute', [1, 2, 4, 5, 10, 15, 20, 30] ],
                            [ 'hour', [1, 2, 3, 4, 6, 8, 12] ],
                            [ 'day', [1, 2, 3, 4, 5, 7, 10, 15] ],
                            [ 'month', [1, 2, 3, 4, 6] ],
                            [ 'year', null ]
                            ]
                        }
                    }
                },
                rangeSelector: {
                    enabled: false,
                    inputEnabled: false
                },
                scrollbar: {
                    liveRedraw: false
                },
                title: {
                    text: ''
                },
                xAxis: [{
                    type: 'datetime',
                    startOnTick: false,
                    endOnTick: false,
                    title: {},
                    labels: {
                        staggerLines: 1,
                        step: 1
                    },
                    events: {
                        afterSetExtremes: function( e ) {
                            Logger.log( 'afterSetExtremes:', e.min, e.max );
                            highstockAdapter.callbacks.onAfterSetExtremes( e.min, e.max );
                        }
                    },
                    minRange: Number.MIN_VALUE,
                    ordinal: false,
                    plotLines: [],
                    plotBands: []
                }],
                yAxis: [{
                    min: null,
                    max: null,
                    height: '100%',
                    opposite: false,
                    plotBands: [],
                    startOnTick: false,
                    endOnTick: false,
                    showLastLabel: true,
                    tickPixelInterval: 45,
                    lineWidth: 1,
                    title: {},
                    labels: {
                        align: 'right',
                        x: -5,
                        y: 4,
                        formatter: function() {
                            /* If we have changed the x-axis since the last time we calculated a max
                            * precision value, we should re-calculate the max starting from 0
                            */
                            if ( highstockAdapter.tooltipDecimalLengthReset === true ) {
                                highstockAdapter.tooltipDecimalLength = 0;
                                highstockAdapter.tooltipDecimalLengthReset = false;
                            }
                            // Change value to a string
                            var str = this.value.toString();
                            // Calculate how many decimal places the string has beyond its .
                            var numDecimals;
                            if ( str.indexOf( "." ) === -1 ) {
                                numDecimals = 0;
                            } else {
                                numDecimals = str.substr( str.indexOf(".") + 1 ).length;
                            }
                            // Only save the most precise number of decimals
                            if ( numDecimals > highstockAdapter.tooltipDecimalLength ) {
                                highstockAdapter.tooltipDecimalLength = numDecimals;
                            }
                            return this.value;
                        }
                    }
                }, {
                    // second y-axis, used for events overlay
                    className: 'events-y-axis',
                    // shade this area to distinguish it from the rest of the plot
                    plotBands: [{
                        className: 'events-plot-band',
                        from: -Infinity,
                        to: Infinity,
                        zIndex: 0
                    }],
                    top: '100%',
                    offset: 0,
                    lineWidth: 1,
                    opposite: false,
                    // Put lower y-values on the top and higher values on the bottom.
                    // This causes the order of labels on the axis to match the order in
                    // the View->EventTypes menu (which is also sorted numerically ascending by event type)
                    reversed: true,
                    labels: {
                        align: 'right',
                        x: -5,
                        y: 13,
                        style: {
                            textOverflow: 'none'
                        }
                    },
                    tickPositioner: HighstockOptions.tickPositionerEveryInteger
                }]
            };
        }

        HighstockOptions.tickPositionerEveryInteger = function ( min, max ) {
            min = Math.floor( min );
            max = Math.ceil( max );
            var ticks = [];
            while (min <= max) {
                ticks.push(min);
                min++;
            }
            return ticks;
        };

        return HighstockOptions;

    }
]);


'use strict';

function highstockAdapter( constants, LimitTypes, HighstockOptions, ColorThemes, Logger ) {

    function Chart( renderElement, callbacks ) {
        this.options = new HighstockOptions( this );

        this.chart = false;

        this.colorTheme = null;

        this.renderElement = renderElement;
        this.preInitFunc = null;
        this.postInitFunc = null;

        // if false, shows the x-value for each item in the legend
        this.showSingleLegendXValue = true;

        // for offset overplotted items, this enables the x-axis to show offset values
        this.xAxisValueOffset = 0;

        // an array of x-offset values for each series in the chart
        this.seriesOffsets = [];

        this.timezone = null;
        this.momentTimeFormat = null;
        this.labelFormat = null;
        this.legendFormatter = null;

        this.tooltipDecimalLengthReset = null;
        this.tooltipDecimalLength = -Number.MAX_VALUE;

        this.callbacks = angular.merge( {}, {
            // A function which is used to determine whether the chart's data is full resolution. Should return true or false.
            dataIsFullRes: angular.noop,
            // A function used to get the data type conversions. It should return an array of dataArray.typeConversion objects.
            getTypeConversions: angular.noop,
            // A function which is called after highcharts sets the x-axis min and max (usually as a result of user interaction).
            // Takes two arguments, min and max.
            onAfterSetExtremes: angular.noop,
            // A function which is called when the user clicks on a series. Takes one argument, which is the URL associated with the
            // clicked series, or undefined if there is none.
            onSeriesClick: angular.noop,
            // A function which is called when the user clicks on a spacecraft event. Takes one argument, which is an object that
            // contains various properties regarding the event.
            onSpacecraftEventClick: angular.noop
        }, callbacks );
    }

    // utility functions

    // find the min and max values in an entire array
    // getValFunc returns the value to compare, so that if it's an array of objects,
    // we can compare the value of a property of each object in the array
    function arrayMinMax( array, getValFunc ) {
        if ( typeof getValFunc === 'undefined' ) {
            getValFunc = function( arrayElement ) {
                return arrayElement;
            };
        }
        var min = Number.MAX_VALUE;
        var max = -Number.MAX_VALUE;
        // find min and max values of used values
        array.forEach( function(val) {
            min = Math.min( min, getValFunc(val) );
            max = Math.max( max, getValFunc(val) );
        });
        return {
            min: min,
            max: max
        };
    }

    // private methods

    /**
     * An object which contains basic information about a series in a chart.
     * @class
     * @type {Object}
     * @property {string} name The name of the series
     * @property {string} color The color of the series in hex notation
     * @property {string} type The type of the series, i.e. 'line' or 'arearange'
     */
    function ChartSeries( name, type, color, index, userOptions ) {
        this.name = name;
        this.type = type;
        this.color = color;
        this.index = index;
        this.userOptions = userOptions;
    }

    /**
     * Returns whether a highcharts series is in the navigator.
     * @private
     * @param {Series} series A highcharts series object.
     * @returns {boolean} Whether the series is in the navigator.
     */
    function seriesIsInNavigator( series ) {
        return series.name.indexOf( 'Navigator' ) !== -1;
    }

    /**
     * Returns whether a highcharts series represents a spacecraft event.
     * @private
     * @param {Series} series A highcharts series object.
     * @returns {boolean} Whether the series represents a spacecraft event.
     */
    function seriesIsEvent( series ) {
        return series.name === 'Event';
    }

    /**
     * Gets the x-axis associated with the navigator. Returns false if no navigator x-axis was found.
     * @private
     * @returns {Object}
     */
    function getNavigatorXAxis() {
        // find which x axis belongs to the navigator
        if ( this.chart.series === undefined ) return false;
        var navigatorSeries = this.chart.series.find( function( series ) {
            return series.name.indexOf( 'Navigator' ) !== -1;
        });
        if ( typeof navigatorSeries !== 'undefined' ) {
            return navigatorSeries.xAxis;
        } else return false;
    }

    function onSetNavigatorOrScrollbar() {
        this.options.navigator.margin = this.options.navigator.enabled ?
            constants.NAVIGATOR_MARGIN :
            this.options.scrollbar.enabled ? 10 : 0;
        // when only the scrollbar is enabled, there's extra space on the bottom (not sure why). Account for this by reducing the spacingBottom.
        this.options.chart.spacingBottom = !this.options.navigator.enabled && this.options.scrollbar.enabled ? 8 : 12;
    }

    /**
     * If the highstock object exists, it gets updated with the options contained in `this.options`.
     * @private
     * @param {boolean} [redraw=true] Whether to trigger a chart redraw.
     */
    function update( options, redraw ) {
        redraw = redraw === undefined ? true : redraw;
        if ( this.chart ) {
            this.chart.update( angular.copy(options), redraw );
        }
    }

    function updateYAxis( options, redraw ) {
        redraw = redraw === undefined ? true : redraw;
        if ( this.chart ) {
            this.chart.yAxis[0].update( angular.copy(options), redraw );
        }
    }

    /**
     * Formats the x-value in the chart's legend. Takes two arguments when data grouping is in effect, or
     * the data is not at full resolution, and one "point" represents a range of x-values. Takes one argument ortherwise.
     * @private
     * @param {number} xVal1 For grouped or binned data, this should be the smallest x-value in the group/bin. For full-res data, this should be the x-value of the point.
     * @param {number} [xVal2] For grouped or binned data, this should be the largest x-value in the group/bin.
     * @returns {string} The formatted x-value text for the legend.
     */
    function legendXValueFormatter ( xVal1, xVal2 ) {
        var self = this;

        // if xVal1 is a non-number, show a hyphen
        xVal1 = ( typeof xVal1 !== 'number' || isNaN(xVal1) ) ? '-' : xVal1;

        if ( typeof this.legendFormatter === 'function' ) {
            return this.legendFormatter( xVal1, xVal2 );
        }

        var legendText;
        if ( this.labelFormat === 'raw' ) {
            // Output the x-axis title, then the value(s)
            legendText = this.options.xAxis[0].title.text + ': ' + xVal1;
            if ( typeof xVal2 !== 'undefined' ) {
                legendText += ' - ' + xVal2;
            }
        } else {
            // if the format is 'auto', null, or undefined
            legendText = ( xVal1 === '-' ) ? '-' : formatXValueAsTime( xVal1 );
            if ( typeof xVal2 !== 'undefined' ) {
                legendText += ' - ' + formatXValueAsTime( xVal2 );
            }
        }
        return legendText;

        function formatXValueAsTime( xVal ) {
            // Output formatted time
            var tempDate = moment.utc( Highcharts.dateFormat('%Y-%m-%dT%H:%M:%S', xVal) );
            tempDate.tz( self.timezone );
            var tzAbbr = tempDate.tz( self.timezone ).zoneAbbr();
            return tempDate.format( self.momentTimeFormat + 'THH:mm:ss') + ' ' + tzAbbr;
        }
    }

    angular.copy({

        /**
         * Initializes the highstock chart.
         * @param {function} [preInitFunc] A function to execute just before the highstock chart is created. Takes one parameter, the configuration object.
         * @param {function} [postInitFunc] A function to execute right after the highstock chart is created. Takes one parameter, the highstock chart object.
         */
        init: function( preInitFunc, postInitFunc ) {
            if ( this.chart ) {
                this.destroy();
            }
            this.preInitFunc = preInitFunc;
            this.postInitFunc = postInitFunc;
            Logger.log('Creating New Stock Chart');

            // the chart uses a reference to the passed options object, and alters a few things here and there,
            // producing unexpected results. We give it a copy of the config object so our config object stays the way we want
            var options = angular.copy( this.options );
            // potentially make custom changes to the options
            if ( preInitFunc ) {
                preInitFunc( options );
            }
            // create the chart
            this.chart = new Highcharts.stockChart( this.renderElement, options, this.postInitFunc );

            // update the tooltip/legend right after the plot is created.
            // Otherwise, the height of the graphic area will change on the first mouseover.
            this.updateTooltip();

            // update legend on mousemove
            var self = this;
            angular.element( this.chart.container ).on( 'mousemove' , function(evt) {
                self.updateTooltip();
            });
        },

        /**
         * Destroys the highstock chart object.
         */
        destroy: function() {
            if ( this.chart ) {
                Logger.log('Destroying Chart');
                this.chart.destroy();
                this.chart = false;
            } else {
                Logger.log('No Chart to Destroy');
            }
        },

        /**
         * Adds a series to the highstock chart.
         * @param {array} data The data for the series, formatted according to highcharts API
         * @param {number} chartDataIndex The index in the chartData object that corresponds to the passed data.
         * @param {string} name The name of the series.
         * @param {string} color The color of the series, formatted in hex notation, i.e. '#ff5399'
         * @param {string} [seriesType='line'] The type of the series. Should be 'line' or 'arearange'.
         * @param {boolean} [redraw=true] Whether to trigger a redraw on the chart.
         * @param {string} [url=''] If defined, the browser will visit this URL when the series is clicked.
         */
        addSeries: function( data, chartDataIndex, name, color, seriesType, redraw, url ) {
            seriesType = ( typeof seriesType === 'undefined' ) ? 'line' : seriesType;
            redraw = ( typeof redraw === 'undefined' ) ? true : redraw;
            url = ( typeof url === 'undefined' ) ? '' : url;
            Logger.log('Adding Series to Chart: REDRAW? ' + redraw + ' seriesType? ' + seriesType );
            this.chart.addSeries({
                type: seriesType,
                name: name,
                data: data,
                url: url,
                color: color,
                chartDataIndex: chartDataIndex
            }, redraw );
        },

        /**
         * Gets an array of objects which contain info on each regular series in the chart.
         * (not spacecraft events or series in the navigator).
         * @returns {array} An array of ChartSeries objects.
         */
        getAllSeries: function() {
            // get all series except events and the navigator
            // in other words, get line and arearange series
            var allSeries = [];
            if ( !this.chart ) {
                return [];
            }
            this.chart.series.forEach( function(series, i) {
                if ( !seriesIsInNavigator.call(this,series) && !seriesIsEvent.call(this,series) ) {
                    allSeries.push( new ChartSeries(series.name, series.type, series.color, i, series.userOptions) );
                }
            });
            return allSeries;
        },

        /**
         * Adds a single spacecraft event to the chart.
         * @param {object} event An object describing the event. Contains properties 'y', 'start', 'end', 'type', and 'info'
         * @param {string} color A CSS-style color value.
         * @param {number} [min] A unix timestamp representing the start of the plot's loaded time range.
         * @param {number} [max] A unix timestamp representing the end of the plot's loaded time range.
         */
        addEvent: function( event, color, minTime, maxTime ) {
            if ( !this.chart ) return;

            // It's possible that an event will have a start time which is before the start of the plot's loaded time range,
            // or have an end time which is after the end of the loaded time range. This causes a few bugs.
            // Ensure that the polygon series will only be drawn within the loaded range.
            var xStart = typeof minTime === 'undefined' ? event.start : Math.max( minTime, event.start );
            var xEnd = typeof maxTime === 'undefined' ? event.end : Math.min( maxTime, event.end );
            // Each event type is placed at a different integer y-value.
            // Adjust the y-values so that each event rect takes up almost a height of 1
            var eventThickness = 14/16;
            var halfMargin = ( 1 - eventThickness ) / 2;
            // start by drawing a vertical line. If the event is discrete, this line will be a few pixels wide
            var data = [
                [xStart, event.y + halfMargin],
                [xStart, event.y + 1-halfMargin]
            ];

            // if the event has a duration, draw a rectangle instead of a line. Add a couple more points to make it a rectangle.
            if ( event.end !== event.start ) {
                data.push(
                    [xEnd, event.y + 1-halfMargin],
                    [xEnd, event.y + halfMargin]
                );
            }
            Logger.log( 'Adding event to chart', event );
            this.chart.addSeries({
                eventDetails: event, // store event details for the modal that pops up when the event is clicked on
                lineWidth: event.start === event.end ? 3 : 1, // thick line for instantaneous events, rectangle with thin lines otherwise
                color: color,
                type: 'polygon',
                data: data,
                name: 'Event'
            }, false );
        },

        /**
         * Removes all spacecraft events from the chart.
         * @param {boolean} [redraw=true] Whether to trigger a chart redraw.
         */
        removeEvents: function( redraw ) {
            redraw = redraw === undefined ? true : redraw;
            if ( !this.chart ) return;
            Logger.log( 'Removing all events from chart' );
            this.chart.series.forEach( function(series) {
                if ( seriesIsEvent.call(this,series) ) {
                    series.remove( false );
                }
            });
            if ( redraw ) {
                this.chart.redraw();
            }
        },

        /**
         * Sets the visibility of specific event types.
         * @param {array} eventTypesToView An array of ID numbers representing event types which will be shown. All others will be hidden.
         * @param {boolean} [redraw=true] Whether to trigger a chart redraw.
         */
        setEventTypeVisibility: function( eventTypesToView, redraw ) {
            redraw = redraw === undefined ? true : redraw;
            if ( !this.chart ) {
                return;
            }
            Logger.log( 'Setting event type visibility', eventTypesToView );
            // for each events series, if the event type is in the list of eventTypesToView, show it. Otherwise, hide it.
            this.chart.series.forEach( function(series) {
                if ( seriesIsEvent.call(this,series) ) {
                    var eventTypeId = series.options.eventDetails.type.id;
                    series.setVisible( eventTypesToView.indexOf(eventTypeId) !== -1, false );
                }
            });
            if ( redraw ) {
                this.chart.redraw();
            }
        },


        /**
         * Sets the extremes for the x-axis and the navigator x-axis.
         * If the x-axis represents time, the passed values should be Unix timestamps.
         * @param {number} min The minimum x-axis value to show.
         * @param {number} max The maximum x-axis value to show.
         * @param {number} navigatorMin The minimum x-axis value to show in the navigator.
         * @param {number} navigatorMax The maximum x-axis value to show in the navigator.
         * @param {boolean} [redraw=true] Whether to trigger a chart redraw.
         */
        setExtremes: function( min, max, navigatorMin, navigatorMax, redraw ) {
            redraw = redraw === undefined ? true : redraw;
            Logger.log('New Extremes Set. Min: ' + min + ' Max: ' + max + ' Navmin: ' + navigatorMin + ' Navmax: ' + navigatorMax );

            // update regular xAxis extremes
            this.options.xAxis[0].min = min;
            this.options.xAxis[0].max = max;
            this.chart.xAxis[0].setExtremes( min, max, false );

            // update the nav extremes
            this.options.navigator.xAxis.min = navigatorMin;
            this.options.navigator.xAxis.max = navigatorMax;
            var navXAxis = getNavigatorXAxis.call( this );
            if ( navXAxis ) {
                navXAxis.setExtremes( navigatorMin, navigatorMax, false );
            }

            if ( redraw ) {
                this.chart.redraw();
            }
        },

        /**
         * Reflows the chart to fit the dimensions of its container element.
         */
        reflow: function() {
            Logger.log('Reflowing Chart');
            this.chart.reflow();
        },

        /**
         * Redraws the chart, applying any new options.
         */
        redraw: function() {
            Logger.log('Redrawing Chart');
            this.chart.redraw();
            // update the tooltip/legend now.
            // Otherwise, the height of the graphic area will change on the first mouseover.
            this.updateTooltip();
        },

        /**
         * Sets the height of the chart.
         * @param {number} height The desired pixel height of the chart.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setHeight: function( height, redraw ) {
            this.options.chart.height = height;
            update.call( this, {chart: { height: height }}, redraw );
        },

        /**
         * Manually sets the width of the area between the y-axis line and the leftmost edge of the chart container.
         * @param {number} width The width of the area, in pixels.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setYAxisLabelWidth: function( width, redraw ) {
            // setting the width of the y-axis label area can be done by setting the chart margin left
            // when we manually set the marginLeft, highcharts ignores a couple things like padding values. Add a bit to the width value to account for that.
            if ( typeof width !== 'undefined' ) {
                width += 14;
            }
            if ( width === this.options.chart.marginLeft ) {
                return;
            }
            // perform an update, only passing it the new margin value
            update.call( this, {chart: {marginLeft: width} }, redraw );
        },

        /**
         * Sets whether the 'Reset zoom' button will show when the chart is zoomed in on either the x- or y-axis.
         * @param {boolean} enabled Whether to show the button.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setResetZoomButtonEnabled: function( enabled, redraw ) {
            // if enabled is true, theme.display is set to the default values (which will show the button)
            // otherwise, if enabled is false or undefined, the button will be hidden
            var value = this.options.chart.resetZoomButton.theme.display = enabled ? undefined : 'none';
            update.call( this, {chart: {resetZoomButton:{theme:{display: value}}}}, redraw );
        },

        /**
         * Enables or disables the navigator at the bottom of the chart.
         * @param {boolean} enabled Whether the navigator should be enabled.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setNavigatorEnabled: function( enabled, redraw ) {
            Logger.log( 'Turning navigator ' + (enabled ? 'on' : 'off') );
            this.options.navigator.enabled = enabled;
            this.options.navigator.height = enabled ? constants.NAVIGATOR_HEIGHT : 0;
            onSetNavigatorOrScrollbar.call( this );
            update.call( this, {
                navigator: this.options.navigator,
                // the call to onSetNavigatorOrScrollbar updates some chart options
                chart: {spacingBottom: this.options.chart.spacingBottom}
            }, false );
            // set the navigator highlight area to the current zoom extremes
            if ( enabled ) {
                var navXAxis = getNavigatorXAxis.call( this );
                if ( navXAxis ) {
                    navXAxis.setExtremes( this.options.navigator.xAxis.min, this.options.navigator.xAxis.max );
                }
            }
            if ( redraw ) {
                this.chart.redraw();
            }
        },

        /**
         * Enables or disables the scrollbar at the bottom of the chart.
         * @param {boolean} enabled Whether the scrollbar should be enabled.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setScrollbarEnabled: function( enabled, redraw ) {
            Logger.log( 'Turning scrollbar ' + (enabled ? 'on' : 'off') );
            if ( this.options.scrollbar === undefined ) {
                this.options.scrollbar = {};
            }
            this.options.scrollbar.enabled = enabled;
            onSetNavigatorOrScrollbar.call( this );
            update.call( this, {
                scrollbar: this.options.scrollbar,
                // the call to onSetNavigatorOrScrollbar updates some navigator and chart options
                navigator: this.options.navigator,
                chart: {spacingBottom: this.options.chart.spacingBottom}
            }, redraw );
        },

        /**
         * Enables or disables data grouping.
         * @param {boolean} enabled Whether data grouping should be enabled.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setDataGroupingEnabled: function( enabled, redraw ) {
            Logger.log( 'Turning data grouping ' + (enabled ? 'on' : 'off') );
            this.options.plotOptions.line.dataGrouping.enabled = enabled;
            this.options.plotOptions.arearange.dataGrouping.enabled = enabled;
            update.call( this, {plotOptions: this.options.plotOptions}, redraw );
        },

        /**
         * Sets the horizontal alignment of the legend text.
         * @param {string} direction The horizontal alignment of the text. Valid values are `'left'`, `'right'`, and `'center'`.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setLegendAlign: function( direction, redraw ) {
            this.options.legend.align = direction;
            update.call( this, {legend:{align: direction}}, redraw );
        },

        /**
         * Sets which axes can be zoomed on by dragging the mouse.
         * @param {string} zoomType Which axes can be zoomed on. Valid values are `'x'`, `'y'`, and `'xy'`.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setZoomType: function( zoomType, redraw ) {
            Logger.log( 'Setting zoom type to ' + zoomType );
            this.options.chart.zoomType = zoomType;
            update.call( this, {chart:{zoomType: zoomType}}, redraw );
        },

        /**
         * Sets how every series (other than min/max series) in the chart is displayed -- via lines, points, or both.
         * @param {string} displayMode The display mode. Valid values are `'lines'`, `'points'`, and `'linesAndPoints'`.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setSeriesDisplayMode: function( displayMode, redraw ) {
            Logger.log( 'Setting series display mode:', displayMode );
            // set both line and point visibility based on the display mode
            this.options.plotOptions.line.marker.enabled = ( displayMode != 'lines' );
            this.options.plotOptions.line.lineWidth = ( displayMode == 'points' ) ? 0 : constants.DEFAULT_LINE_WIDTH;
            update.call( this, {plotOptions: {line: this.options.plotOptions.line}}, redraw );
        },

        /**
         * Enables or disables the min/max series (also called 'range' series).
         * @param {boolean} visible Whether the min/max series should be shown.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setRangeVisibility: function( visible, redraw ) {
            Logger.log( 'Turning range visibility ' + (visible ? 'on' : 'off') );
            this.options.plotOptions.arearange.visible = visible;
            update.call( this, {plotOptions: {arearange: {visible: visible}}}, redraw );
        },

        /**
         * Sets the values of the yellow and red limit areas and draws bands representing the limit areas behind the series on the chart.
         * @param {number} redLow The y-value of the lower red limit threshold.
         * @param {number} redHigh The y-value of the upper red limit threshold.
         * @param {number} yellowLow The y-value of the lower yellow limit threshold.
         * @param {number} yellowHigh The y-value of the upper yellow limit threshold.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setYAxisLimitBands: function( redLow, redHigh, yellowLow, yellowHigh, redraw ) {
            Logger.log( 'Setting y-axis limit bands' );
            this.options.yAxis[0].plotBands = [{
                //Yellow low band
                color: this.colorTheme.limits.bands.warn,
                from: redLow,
                to: yellowLow,
                limitType: LimitTypes.WARN,
                zIndex: 1
            }, {
                // Yellow high band
                color: this.colorTheme.limits.bands.warn,
                from: yellowHigh,
                to: redHigh,
                limitType: LimitTypes.WARN,
                zIndex: 1
            },{
                // Red low band
                color: this.colorTheme.limits.bands.bad,
                from: -Number.MAX_VALUE,
                to: redLow,
                limitType: LimitTypes.BAD,
                zIndex: 1
            }, {
                // Red high band
                color: this.colorTheme.limits.bands.bad,
                from: redHigh,
                to: Number.MAX_VALUE,
                limitType: LimitTypes.BAD,
                zIndex: 1
            }];

            updateYAxis.call( this, this.options.yAxis[0], redraw );
        },

        /**
         * Hides the red and yellow limit areas.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        disableYAxisLimitBands: function( redraw ) {
            Logger.log( 'Disabling y-axis limit bands' );
            this.options.yAxis[0].plotBands = [];
            updateYAxis.call( this, this.options.yAxis[0], redraw );
        },

        /**
         * Sets the title, or label, along the y-axis, representing the units of the chart's data.
         * @param {string} text The text to use as the y-axis title.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setYAxisTitle: function( text, redraw ) {
            Logger.log( 'Setting y-axis title:', text );
            // if the parameter is falsy, remove the title by setting it to undefined
            this.options.yAxis[0].title.text = text ? text : undefined;
            updateYAxis.call( this, {title:{text: text}}, redraw );
        },

        /**
         * Sets the scale of the chart's y-axis. Set `low` and `high` to `null` to enable automatic scaling based on the loaded data.
         * @param {number} low The lowest value to show on the y-axis.
         * @param {number} high The highest value to show on the y-axis.
         * @param {number} paddingPercent The amount of padding to put on the top and bottom of the y-axis extremes. A value of 0.1 is 10% padding.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setYAxisScaling: function( low, high, paddingPercent, redraw ) {
            Logger.log( 'Setting y-axis scaling:', low, high, paddingPercent );
            paddingPercent = paddingPercent || 0;
            var padding = paddingPercent * ( high - low );
            this.options.yAxis[0].min = (low === null)  ? null : low - padding;
            this.options.yAxis[0].max = (high === null) ? null : high + padding;
            updateYAxis.call( this, this.options.yAxis[0], redraw );
        },

        /**
         * Sets the y-axis scale as either linear or logarithmic.
         * @param {string} scaleType The scale type of the y-axis. Valid values are `'linear'` and `'logarithmic'`.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setYAxisScaleType: function( scaleType, redraw ) {
            Logger.log( 'Setting y-axis scale type:', scaleType );
            if ( scaleType !== 'linear' && scaleType !== 'logarithmic' ) {
                console.error("setYAxisScaleType: type must be either 'linear' or 'logarithmic'. Attempted to set type to " + scaleType);
            } else {
                this.options.yAxis[0].type = scaleType;
            }
            updateYAxis.call( this, {type: scaleType}, redraw );
        },

        /**
         * Sets the formatting of the labels along the chart's x-axis.
         * @param {string} labelFormat The format of the x-axis labels. Valid values are:
         *   `null`: Uses the default highstock formatter for x-axis values.
         *   `'auto'`: Formats the x-axis values as human-readable timestamps, and honors the date format setting (YYYY-MM-DD vs. YYYY-DDD).
         *   `'raw'`: Does no formatting of the x-axis values -- outputs the raw values.
         *   `'secondsSinceT0'`: Formats the values as number of seconds after the minimum x-axis value of the chart.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setXAxisLabels: function( labelFormat, redraw ) {
            this.labelFormat = labelFormat;

            var formatter, navigatorFormatter;
            var chart = this;
            if ( labelFormat === 'secondsSinceT0') {
                formatter = function() {
                    return xAxisLabelFormatterT0( this );
                };
                navigatorFormatter = formatter;
            } else if ( labelFormat === 'raw' ) {
                formatter = function() {
                    return this.value + chart.xAxisValueOffset;
                };
                navigatorFormatter = formatter;
            } else if ( labelFormat === 'auto' ) {
                formatter = function() {
                    return xAxisLabelFormatterDefault( this );
                };
                navigatorFormatter = function() {
                    var tempDate = moment.utc( new Date( this.value + chart.xAxisValueOffset ) );
                    tempDate.tz( chart.timezone );
                    return tempDate.format( 'HH:mm' );
                };
            } else if ( labelFormat === null || labelFormat === undefined ) {
                // use the default highcharts formatter
                formatter = null;
                navigatorFormatter = null;
            } else {
                console.error( 'Programmer error. Unrecognized labelFormat:', labelFormat );
            }

            // apply the settings to the highchart object
            this.options.xAxis[0].labels.formatter = formatter;
            this.options.navigator.xAxis.labels.formatter = navigatorFormatter;
            update.call( this, this.options, redraw );

            /* highstockAxisLabelObj is the object assigned to 'this' in the axis label formatter function defined in the highstock config object.
            * These xAxisLabelFormatter functions are intended to be used only in this context.
            */
            function xAxisLabelFormatterDefault( highstockAxisLabelObj ) {
                var tempDate = moment.utc( new Date( highstockAxisLabelObj.value + chart.xAxisValueOffset ) );
                tempDate.tz( chart.timezone );
                return tempDate.format( chart.momentTimeFormat + '[<br>]HH:mm:ss');
            }
            function xAxisLabelFormatterT0( highstockAxisLabelObj ) {
                return '+' + ( Math.round( (highstockAxisLabelObj.value - highstockAxisLabelObj.chart.xAxis[0].getExtremes().dataMin) / 1000) ) + 's';
            }
        },

        /**
         * Sets the title of the chart's x-axis.
         * @param {string} text The text to use for the x-axis title.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setXAxisTitle: function( text, redraw ) {
            // if the parameter is falsy, remove the title by setting it to undefined
            if ( !text ) {
                text = undefined;
            }
            this.options.xAxis[0].title.text = text;
            update.call( this, {xAxis:[{title:{text: text}}]}, redraw );
        },

        /**
         * Enables or disables the horizontal crosshair (perpendicular to the y-axis).
         * @param {boolean} enabled Whether the crosshair should be enabled.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setYAxisCrosshairEnabled: function( enabled, redraw ) {
            Logger.log( 'Turning y-axis crosshair ' + (enabled ? 'on' : 'off') );
            if ( enabled ) {
                this.options.yAxis[0].crosshair = { snap: false };
                // sometimes the crosshair is enabled before the color theme is set
                if ( typeof this.colorTheme !== 'undefined' ) {
                    this.options.yAxis[0].crosshair.color = this.colorTheme.axis.crosshairColor;
                }
            } else {
                this.options.yAxis[0].crosshair = false;
            }
            update.call( this, { yAxis:[{crosshair: this.options.yAxis[0].crosshair}] }, redraw );
        },

        /**
         * Sets color zones for a single series. Color zones cause the series to be colored based on the y-value at each point.
         * @param {number} seriesIndex The index number of the series to update.
         * @param {object} colorZones The color zones to apply to the series, as returned from the ChartData.getLimitZones function.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setSeriesColorZones: function( seriesIndex, colorZones, redraw ) {
            this.chart.series[seriesIndex].update( {zones: colorZones}, redraw );
        },

        /**
         * Enables or disables the chart's legend.
         * @param {boolean} legendEnabled Whether the legend should be enabled.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setLegendEnabled: function( legendEnabled, redraw ) {
            Logger.log( 'Turning legend ' + (legendEnabled ? 'on' : 'off') );
            this.options.legend.enabled = legendEnabled;
            update.call( this, { legend:{enabled: legendEnabled} }, redraw );
        },

        /**
         * Adds spacecraft events to the chart, or disables them.
         * @param {boolean} enabled Whether to show spacecraft events.
         * @param {EventsData} [eventsData] The spacecraft events data (a list of events, and a list of possible event types for the mission). Required if `enabled` is `true`.
         * @param {array} [viewEventTypes] A whitelist of event type IDs to show. Required if `enabled` is `true`.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setEventsOverlay: function( enabled, eventsData, viewEventTypes, redraw ) {
            Logger.log( 'Turning events overlay ' + (enabled ? 'on' : 'off') );
            // The index values of the list of event types equates to y-values on the axis.
            // i.e. events of the first type are drawn between the y-values of 0 and 1.
            // viewEventTypes is an array of strings, each one a type of event which is allowed to show.

            // reset plot bands and possibly add them in later
            this.options.xAxis[0].plotBands = [];
            this.options.xAxis[0].plotLines = [];

            if ( enabled ) {
                // make a copy of the original viewEventTypes array so we can safely modify it
                viewEventTypes = angular.copy( viewEventTypes );
                // there are some events that the user may want to hide... we also want to hide rows on the y-axis
                // for which there are no events in the shown time range. Look through all the events to see
                // which types are present, and hide the rest.
                var presentEventTypeIds = [];
                eventsData.events.forEach( function(event) {
                    if ( presentEventTypeIds.indexOf(event.type.id) === -1 ) {
                        presentEventTypeIds.push( event.type.id );
                    }
                });
                viewEventTypes = viewEventTypes.filter( function(typeId) {
                    return presentEventTypeIds.indexOf( typeId ) !== -1;
                });

                var numRows = viewEventTypes.length;

                // set y-axis breaks for events
                var min = Number.MAX_VALUE,
                    max = -Number.MAX_VALUE;
                this.options.yAxis[1].breaks = [];
                // first find the min and max values of the axis
                eventsData.types.forEach( function(type, i) {
                    if ( viewEventTypes.indexOf(type.id) >= 0 ) {
                        min = Math.min( min, i );
                        max = Math.max( max, i );
                    }
                }, this );
                max++;
                // now add axis breaks
                eventsData.types.forEach( function(type, i) {
                    if ( viewEventTypes.indexOf(type.id) === -1 && i < max && i >= min ) {
                        this.options.yAxis[1].breaks.push({
                            // constructing the break like this ensures that the correct labels will be shown.
                            // Putting breaks on the exact values that labels live on can hide labels in some unpredictable ways.
                            from: i - 0.00001,
                            to: i + 0.99999
                        });
                    }
                }, this );

                this.options.yAxis[1].min = min;
                this.options.yAxis[1].max = max;

                // make room for the event area and show it
                // also set the max and height for the event y-axis
                var eventRowHeight = 16; // an arbitrary value. 16 makes for a nice clickable thickness without taking too much space.
                this.options.yAxis[1].height = this.options.xAxis[0].offset = eventRowHeight * numRows;
                this.options.yAxis[1].visible = true;

                var chart = this;
                this.options.yAxis[1].labels.formatter = function() {
                    var eventType = eventsData.types[this.value];
                    if ( typeof eventType === 'undefined' ) return '';
                    var labelText = eventType === undefined ? '' : eventType.label;
                    // When the series uses the 'light' colors, the labels use the 'dark', colors, and vice versa
                    var color = ColorThemes.getColorForEventType( eventType, eventsData.types, ColorThemes.getOppositeTheme(chart.colorTheme) ).series;
                    return '<div class="events-label" title="' + labelText + '" style="color:' + color + '">' + labelText + '</div>';
                };

                // set x-axis bands and lines
                // for each event with a start and end, create a band. If the event only has a start, create a line.
                eventsData.events.forEach( function(event, i) {
                    if ( viewEventTypes.indexOf(event.type.id) === -1 )  {
                        return;
                    }
                    var eventTypeColor = ColorThemes.getColorForEventType( event.type, eventsData.types, this.colorTheme );
                    var eventTypeOrderIndex = eventsData.types.findIndex( function(type) {
                        return type.id == event.type.id;
                    });
                    if ( event.start === event.end ) {
                        this.options.xAxis[0].plotLines.push({
                            color: eventTypeColor.line,
                            value: event.start,
                            width: 2,
                            zIndex: 1
                        });
                    } else {
                        this.options.xAxis[0].plotBands.push({
                            color: eventTypeColor.band,
                            from: event.start,
                            to: event.end,
                            zIndex: 1
                        });
                    }
                }, this );
            } else {
                this.options.yAxis[1].height = this.options.xAxis[0].offset = 0;
                this.options.yAxis[1].visible = false;
            }

            // update the highchart object
            update.call( this, this.options, redraw );
        },

        /**
         * For charts with discrete data, hides all labels on the y-axis except for those associated with y-values of the loaded data.
         * @param {array} breaks An array of objects, each with a `from` and `to` property, defining where the y-axis breaks are.
         *   This array can be generated by the `ChartData.calculateYAxisBreaks` method.
         * @param {array} usedDiscreteVals An array of y-values to show on the y-axis.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        hideUnusedDiscreteLabels: function( breaks, usedDiscreteVals, redraw ) {
            Logger.log( 'Hiding unused discrete labels' );
            // breaks should be an array of objects, like:
            // [{from: 1, to: 3}, {from: 5, to: 14}]
            var minmax = arrayMinMax( usedDiscreteVals );
            // normally the padding percent is 0.1, but we need to set it based on the number of visible values, not based on the range of min to max
            // See WEBTCAD-1201
            // If only one discrete value is used, the padding ends up being Infinity. Don't let this happen
            var alteredPadding = ( usedDiscreteVals.length === 1 ) ? 0 : 0.05 * usedDiscreteVals.length / (minmax.max - minmax.min );
            this.setYAxisScaling( minmax.min, minmax.max, alteredPadding, redraw );
            this.options.yAxis[0].breaks = breaks;
            updateYAxis.call( this, {breaks: breaks}, redraw );
        },

        /**
         * For charts with discrete data, shows all values on the y-axis.
         * @param {array} conversions An array of subarrays -- each subarray defines label-to-value conversions for a plotted dataset,
         *   as returned by the `ChartData.getTypeConversions` method.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        showAllDiscreteLabels: function( conversions, redraw ) {
            Logger.log( 'Showing discrete labels' );
            // find min and max numeric values of the labels for all the datasets
            var allConversions = [];
            conversions.forEach( function(conversion) {
                allConversions = allConversions.concat( conversion );
            })
            var minmax = arrayMinMax( allConversions, function(el) {
                return el.value;
            });
            this.setYAxisScaling( minmax.min, minmax.max, 0.05, redraw );
            this.options.yAxis[0].breaks = undefined;
            updateYAxis.call( this, {breaks: undefined}, redraw );
        },

        /**
         * For charts with discrete data, defines how y-axis values are formatted.
         * @param {array} conversions An array of subarrays -- each subarray defines label-to-value conversions for a plotted dataset,
         *   as returned by the `ChartData.getTypeConversions` method. If this value is falsy, raw numbers will be shown on the y-axis instead of labels.
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setDiscreteFormatters: function( conversions, redraw ) {
            if ( !conversions ) {
                this.options.yAxis[0].labels.formatter = undefined;
            } else {
                this.options.yAxis[0].labels.formatter = angular.copy( function() {
                    // preserve the reference to 'this'
                    var self = this;
                    var typeConversion = conversions[0].find( function( conversion ) { return conversion.value === self.value; });
                    return typeConversion ? typeConversion.state : undefined;
                });
            }

            // force ticks to show at every integer
            this.options.yAxis[0].tickPositioner = HighstockOptions.tickPositionerEveryInteger;

            // disable ellipsis (WEBTCAD-1201)
            this.options.yAxis[0].labels.style = {
                textOverflow: 'none'
            };
            this.options.plotOptions.line.step = true;

            updateYAxis.call( this, this.options.yAxis[0], false );
            update.call( this, {plotOptions:{line:{step: true}}}, false );
            if ( redraw ) {
                this.chart.redraw();
            }
        },

        /**
         * Defines which color theme to use for the chart.
         * @param {string} theme Which color theme to use. Valid values include any key of the `ColorThemes.themes` object (`'light'` or `'dark'`).
         * @param {boolean} [redraw=true] Whether to redraw the chart.
         */
        setColorTheme: function( theme, redraw ) {
            if ( typeof theme === 'undefined' ) return;
            Logger.log( 'Setting color theme:', theme );
            // the 'theme' parameter is a string
            // use angular.copy to make a copy of the theme, because highcharts will use the pointer values when passed the style objects
            this.colorTheme = angular.copy( ColorThemes.themes[theme] );
            // apply the theme to the highcharts config
            extendDeep( this.options, {
                chart: {
                    backgroundColor: this.colorTheme.backgroundColor,
                    selectionMarkerFill: this.colorTheme.selectionMarkerFill
                },
                colors: this.colorTheme.colors,
                legend: {
                    title: {
                        style: this.colorTheme.legend.titleStyle
                    },
                    itemStyle: this.colorTheme.legend.itemStyle,
                    itemHoverStyle: this.colorTheme.legend.itemStyle
                },
                navigator: {
                    outlineColor: this.colorTheme.navigator.outlineColor,
                    maskFill: this.colorTheme.navigator.maskFill,
                    handles: {
                        backgroundColor: this.colorTheme.navigator.handles.backgroundColor,
                        borderColor: this.colorTheme.navigator.handles.borderColor
                    },
                    xAxis: {
                        labels: {
                            style: this.colorTheme.axis.labelStyle
                        },
                        gridLineColor: this.colorTheme.axis.gridLineColor
                    }
                }
            });

            extendDeep( this.options.xAxis[0], {
                gridLineColor: this.colorTheme.axis.gridLineColor,
                lineColor: this.colorTheme.axis.lineColor,
                minorGridLineColor: this.colorTheme.axis.minorGridLineColor,
                minorTickColor: this.colorTheme.axis.minorTickColor,
                tickColor: this.colorTheme.axis.tickColor,
                crosshair: {
                    color: this.colorTheme.axis.crosshairColor
                },
                labels: {
                    style: this.colorTheme.axis.labelStyle
                }
            });

            extendDeep( this.options.yAxis[0], {
                gridLineColor: this.colorTheme.axis.gridLineColor,
                lineColor: this.colorTheme.axis.lineColor,
                minorGridLineColor: this.colorTheme.axis.minorGridLineColor,
                minorTickColor: this.colorTheme.axis.minorTickColor,
                tickColor: this.colorTheme.axis.tickColor,
                crosshair:
                    this.options.yAxis[0].crosshair ?
                    { color: this.colorTheme.axis.crosshairColor } :
                    false,
                labels: {
                    style: this.colorTheme.axis.labelStyle
                }
            });


            // set the colors of the event overlay bands/lines
            if ( this.options.xAxis[0].plotBands ) {
                this.options.xAxis[0].plotBands.forEach( function( band ) {
                    band.color = this.colorTheme.events.bands;
                }, this );
            }
            if ( this.options.xAxis[0].plotLines ) {
                this.options.xAxis[0].plotLines.forEach( function(line) {
                    line.color = this.colorTheme.events.lines;
                }, this );
            }

            // set the colors of the limit bands/lines
            if ( this.options.yAxis[0].plotBands ) {
                this.options.yAxis[0].plotBands.forEach( function( band ) {
                    band.color = ( band.limitType === LimitTypes.WARN ) ? this.colorTheme.limits.bands.warn : this.colorTheme.limits.bands.bad;
                }, this );
            }

            update.call( this, this.options, redraw );

            function extendDeep( dst ) {
                angular.forEach( arguments, function( obj ) {
                    if ( obj !== dst ) {
                        angular.forEach( obj, function( value, key ) {
                            if ( dst[key] && dst[key].constructor && dst[key].constructor === Object ) {
                                extendDeep( dst[key], value );
                            } else {
                                dst[key] = value;
                            }
                        });
                    }
                });
                return dst;
            }
        },

        /**
         * Generates a string to be used in the chart's legend, which represents the hovered point's x-value. The point may represent
         *   a single data point, or a group/bin of points.
         * @param {object} point A Highstock Point object
         * @param {number} [xOffset=0] A number representing the hovered series' x-offset from the chart's main x-axis.
         * @returns {string} A string representing either a single x-value or a range of x-values, depending on whether the passed Point
         *   object represents a group of points.
         */
        generateXLegendString: function( point, xOffset ) {
            xOffset = xOffset || 0;
            var group = point.dataGroup;
            // If data grouping is off, or the data group represents only one point, show a single x-value.
            // Once latis is able to serve start and end times for binave data, we should display those here
            // (instead of a single date) when not viewing full-res data.
            if ( typeof group === 'undefined' || group.length === 1 ) {
                return legendXValueFormatter.call( this, point.x + xOffset );
            } else {
                // otherwise, show an x-range from the start of the group to the end of the group.
                // Once latis is able to serve start and end times for bins, this should show the start time
                // of the first bin and the end time of the last bin in the data group.
                var series = point.series;
                var data = series.options.data;
                // group.start is the index of the first data point in the group, starting at the index of
                // the first currently visible data point, as opposed to the first data point overall. This may be a bug:
                // https://github.com/highcharts/highcharts/issues/6335
                // The workaround is to use the index of the first visible data point (series.cropStart).
                var xStart = data[series.cropStart + group.start][0];
                var xEnd = data[series.cropStart + group.start + group.length -1][0];
                return legendXValueFormatter.call( this, xStart + xOffset, xEnd + xOffset );
            }
        },


        /**
         * Calls the `runPointActions` method on the highstock chart object.
         * @param {object} evt The event object on which the point actions should be based.
         */
        runPointActions: function( evt ) {
            this.chart.pointer.runPointActions(evt);
        },

        /**
         * Calls the `reset` method on the highstock chart's mouse tracker object.
         */
        pointerReset: function() {
            this.chart.pointer.reset( false, 500 );
        },

        /**
         * Resets the y-zoom so that the full range of the y-axis is shown.
         */
        resetYZoom: function() {
            Logger.log('Chart Zoomed Out');
            this.chart.zoomOut();
        },

        /**
         * Triggers a file download of a static image of the chart.
         * @param {string} filetype The desired filetype of the image to be downloaded. Valid values are `'png'` and `'svg'`.
         * @param {string} filename The desired name of the file to be downloaded.
         */
        downloadImage: function( filetype, filename ) {
            // filetype should be 'png' or 'svg'
            var mime = '';
            if ( filetype === 'png' ) mime = 'image/png';
            else if ( filetype === 'svg' ) mime = 'image/svg+xml';
            else if ( filetype === 'pdf' ) mime = 'application/pdf';
            try {
                this.chart.exportChartLocal({
                    filename: filename,
                    type: mime,
                    sourceWidth: this.chart.container.clientWidth
                });
            } catch ( e ) {
                alert( 'Sorry, your browser does not support this feature. Try using Chrome or Firefox.' );
            }
        },

        /**
         * Updates all the x- and y-values in the legend.
         * @param {boolean} clearData Whether to clear all info in the legend.
         */
        updateTooltip: function( clearData ) {
            // Legend render handler
            var chart = this.chart;
            if ( !this.options.legend.enabled ) {
                return;
            }
            //now we have to update our values in the legend which is serving as our tooltip
            var legendOptions = chart.legend.options;
            var hoverPoints = chart.hoverPoints;

            if ( !hoverPoints && chart.hoverPoint ) {
                hoverPoints = [chart.hoverPoint];
            }
            if ( hoverPoints ) {
                angular.forEach(hoverPoints, function (point) {
                    point.series.point = point;
                });
                angular.forEach(chart.legend.allItems, function (item) {
                    // clear the legend value if needed
                    if ( clearData ) {
                        item.point = {};
                    }

                    item.legendItem.attr({
                        text: legendOptions.labelFormat ?
                            Highcharts.format(legendOptions.labelFormat, item) :
                            legendOptions.labelFormatter.call(item)
                    });
                });
            }

            if ( chart.legend.title ) {
                if ( !this.showSingleLegendXValue ) {
                    // the x-values are rendered in the formatter for each series, not here.
                    chart.legend.title.textSetter('');
                } else if ( clearData || !hoverPoints ) {
                    // Passing an empty object to generateXLegendString ultimately sets the title to a hyphen.
                    // Set the title to a hyphen rather than an empty string.
                    // Using an empty string would make the plot expand vertically a bit.
                    // Kind of irritating when the plots are wiggling around whenever you mouseover/out a plot.
                    chart.legend.title.textSetter( this.generateXLegendString({}) );
                } else if ( hoverPoints ) {
                    chart.legend.title.textSetter( this.generateXLegendString( hoverPoints[0]) );
                }
                chart.legend.render();
            }
        }
    }, Chart.prototype);
    return ( Chart );
}

angular.module( 'laspChart' ).factory( 'Chart', [ 'constants', 'LimitTypes', 'HighstockOptions', 'ColorThemes', 'Logger', highstockAdapter ]);
'use strict';

function latisFactory( $http, $q, $document, $window ) {
    /**
     * @ngdoc service
     * @name latis
     * @requires $http
     * @requires $q
     *
     * @description
     * Factory that sends out HTTP GET requests to LaTiS and returns a promise object.
     * Upon being resolved, this promise object becomes the results of the
     * HTTP GET.
     */
    var latis = {};

    var latisBase = 'latis/'; // the URL base for most latis operations
    var latisJoinBase = 'join/'; // the URL base for full outer join operations (for downloading a csv of multiple datasets)

    // Copied from here: http://stackoverflow.com/questions/470832/getting-an-absolute-url-from-a-relative-one-ie6-issue#answer-472729
    function escapeHTML(s) {
        // Comment from Ransom:
        // > Very clever, but it took me a few moments to realize you were using split/join
        // > as a global string replace. Note that using replace() with a global flag is
        // > much faster than split/join (at least in Chrome), so consider replace() if
        // > this function is ever churning through large amounts of strings
        //
        return s.split('&').join('&amp;').split('<').join('&lt;').split('"').join('&quot;');
    }

    /**
     * @ngdoc method
     * @name get
     * @methodOf latis
     * @description
     * Runs an HTTP GET against a given URL
     *
     * @param {string} URL URL to run the HTTP GET against
     * @param {function} cancel Callback function to execute when the request is cancelled or times out
     * @param {function} progressHandler Callback function to execute on the XHR progress event
     * @returns {Http Promise} HTTP promise that will resolve to the results of
     * the HTTP GET.
     *
     * @example
     * ```
     * latis.get( 'http://www.google.com' );
     * ```
     * would return a promise that (sometime in the future) resolves to:
     * ```
     * {
     *     'status': 200,
     *     'data': '<!doctype html><html itemscope=...',
     *     'config': ...
     * }
     * ```
     * (assuming google.com is up...)
     */
    latis.get = function( URL, cancel, progressHandler ) {
        /* The timeout property of the http request takes a deferred value
         * that will abort the underlying AJAX request if/when the deferred
         * value is resolved.
         */
        var deferred = $q.defer();
        cancel = cancel || $q.defer();
        progressHandler = progressHandler || angular.noop;

        //URL = 'http://ds-webapp-dev:8080/ops/qscat/webtcad/' + URL;

        // Initiate the AJAX request.
        var request = $http({
            cache: true,
            method: 'get',
            url: latisBase + URL,
            timeout: cancel.promise,
            eventHandlers: {
                progress: progressHandler
            }
        });

        /* Now that we have the promise that we're going to return to the
         * calling context, we'll augment it with the abort method. Since
         * the $http service uses a deferred value for the timeout,
         * all we have to do here is resolve the value and AngularJS will
         * abort the underlying AJAX request.
         */
        deferred.promise.abort = function() {
            deferred.resolve({});
            return deferred.promise;
        };

        /* Rather than returning the http-promise object, we want to pipe it
         * through another promise so that we can "unwrap" the response
         * without letting the http-transport mechanism leak out of the
         * service layer.
         */
        request.then(
            function( response ) {
                deferred.resolve({
                    'status': response.status,
                    'data': response.data,
                    'config': response.config
                });
                return( response.data );
            },
            function( response ) {
                /* Called asynchronously if an error occurs
                 * or server returns response with an error status.
                 */
                deferred.reject({
                    'status': response.status,
                    'data': response.data,
                    'config': response.config
                });
            }
        );

        return deferred.promise;
    };

    // Modified from polyfill here:
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/endsWith
    function endsWith( str, suffix ) {
        var pos = str.length - suffix.length;
        var lastIndex = str.indexOf(suffix, pos);
        return lastIndex !== -1 && lastIndex === pos;
    }

    latis.setBase = function( newBase ) {
        latisBase = newBase;
        if ( !endsWith( latisBase, '/' ) ) {
            latisBase += '/';
        }
    };

    latis.setJoinBase = function( newJoinBase ) {
        latisJoinBase = newJoinBase;
        if ( !endsWith( latisJoinBase, '/') ) {
            latisJoinBase += '/';
        }
    };

    latis.getBase = function() {
        return latisBase;
    };

    latis.getJoinBase = function() {
        return latisJoinBase;
    };

    latis.getFullyQualifiedLatisBase = function() {
        if ( latisBase.indexOf('://') === -1 ) {
            // the full URL will the the app's URL root plus the latisBase
            // construct an <a> element with a relative link, and let it resolve the relative URL to a full one
            var a = document.createElement('a');
            a.href = latisBase;
            return a.href;
        } else {
            // latisBase is already a fully qualified URL
            return latisBase;
        }
    };

    // Modified from here: http://stackoverflow.com/questions/470832/getting-an-absolute-url-from-a-relative-one-ie6-issue#answer-472729
    latis.qualifyURL = function( url ) {
        var el = document.createElement('div');
        el.innerHTML = '<a href="' + escapeHTML( latisBase + url ) + '"></a>';
        return el.firstChild.href;
    };

    latis.getDatasetDownload = function( identifier, parameters, startTime, endTime ) {
        var url = latisBase + identifier + '.' + parameters;
        if ( typeof startTime !== 'undefined' && typeof endTime !== 'undefined') {
            $window.open( url + '&time>=' + startTime + '&time<=' + endTime );
        } else {
            $window.open( url );
        }
    };

    latis.timeFormatters = {
        /**
         * @ngdoc method
         * @name timeFormatters.secondsSinceT0
         * @methodOf latis
         * @description
         * Creats a query parameter to be used when downloading CSV data, instructing latis to format the date as seconds since a certain time.
         *
         * @param {date} dateT0 The start date. Timestamp labels will be formatted as seconds since this date.
         */
        secondsSinceT0: function( dateT0 ) {
            return '&convert(time,seconds since ' + dateT0.toISOString() + ')';
        },
        /**
         * @ngdoc method
         * @name timeFormatters.simple
         * @methodOf latis
         * @description
         * Creats a query parameter to be used when downloading CSV data, instructing latis to format the date as either an ISO-like string or a DOY string.
         *
         * @param {string} timeFormat A short string representing how to format the date. Accepted values are 'YYYY-DDDD' and 'YYYY-MM-DD'.
         */
        simple: function( timeFormat ) {
            var formatString;
            switch ( timeFormat ) {
            case 'YYYY-DDDD':
                formatString = 'yyyy-DDD\'T\'HH:mm:ss.SSS';
                break;
            case 'YYYY-MM-DD':
                formatString = 'yyyy-MM-dd\'T\'HH:mm:ss.SSS';
                break;
            default:
                console.error( 'Programmer error: timeFormat not recognized: ' + timeFormat );
                formatString = '';
            }

            return '&format_time(' + formatString + ')';
        }
    };


    function convertToFullResURL(datasetURL){
        // Helper function for downloadCSV
        // All "Auto" downloads should contain full resolution data (WEBTCAD-1174)
        // Script should also preserve text all after TelemetryItem (WEBTCAD-1177)

        if (( datasetURL.indexOf("Auto") != -1 ) && ( datasetURL.indexOf("Analog") != -1 )){
            datasetURL = datasetURL.replace( /.+?(?=TelemetryItem)/, "Analog");
        }
        else if (( datasetURL.indexOf("Auto") != -1 ) && (datasetURL.indexOf("Discrete") != -1 )){
            datasetURL = datasetURL.replace( /.+?(?=TelemetryItem)/, "Discrete");
        }

        return datasetURL;
    };

    /**
     * @ngdoc method
     * @name downloadCSV
     * @methodOf latis
     * @description
     * Downloads CSVs for one or more datasets
     *
     * @param {array} datasetURLs An array of access URLs for datasets
     * @param {string} timeFormatQueryParam A query parameter to be appended to the download URL. This string must be generated using one of the latis.timeFormatters functions.
     */
    latis.downloadCSV = function( datasetURLs, timeFormatQueryParam ) {
        timeFormatQueryParam = timeFormatQueryParam || '';
        if ( datasetURLs.length === 1 ) {
            datasetURLs[0] = convertToFullResURL(datasetURLs[0]);
            // if there's only one CSV to download, open a new window and make a GET request to latis
            $window.open( latisBase + datasetURLs[0].replace('.jsond', '.csv') + timeFormatQueryParam );
        } else {
            // latis can merge multiple datasets together into one csv
            // in order to do this, we need to POST to it a list of the datasets to get
            //
            // Normally, a file download can only be triggered by setting the URL of a browser window
            // This would potentially send a very long GET request to the server--our list of datasets and parameters to download could potentially be rather long
            // GET request lengths max out at much lower request lengths than POST requests do. So we want to trigger a file download via POST request.
            // The only way to do this is to submit a form (POST method) with the download query information contained in the form

            // we need to convert our list of relative URLs into fully qualified URLs. The latis join service needs full URLs.
            // find the full URL if latisBase isn't one
            var fullURLBase = latis.getFullyQualifiedLatisBase();

            for ( var i = 0; i < datasetURLs.length; i++ ) {
                datasetURLs[i] = convertToFullResURL(datasetURLs[i]);
                // construct the URLs, replacing 'jsond' with 'json', and appending the time format.
                // The format should always be ISO-8601 (WEBTCAD-1110)
                datasetURLs[i] = fullURLBase + datasetURLs[i].replace( '.jsond', '.json' ) + "&format_time(yyyy-MM-dd'T'HH:mm:ss.SSS)";
            }

            // rather than appending the time formatting string to each dataset URL, we need to append it to the service URL, as a GET parameter
            var form = angular.element( '<form>' ).attr({
                method: 'post',
                target: '_blank',
                action: latisJoinBase + '?' + timeFormatQueryParam
            });
            form.append(
              angular.element( '<input>' ).attr({
                type: 'hidden',
                name: 'urls',
                value: datasetURLs.join(';') // the latis join service requires that urls are semicolon-delimited
              })
            );
            $document.find( 'body' ).append( form ); // not sure if the form even needs to be added to the DOM
            form[0].submit();
            form.remove();
        }
    };


    // Return the public API.
    return latis;
}

angular.module( 'latis', [] ).factory( 'latis', ['$http', '$q', '$document', '$window', latisFactory]);

angular.module("laspChart").run(["$templateCache", function($templateCache) {$templateCache.put("download_modal/download_modal.html","<div class=\"modal-body-wrapper download-modal\"><div class=\"modal-body\"><button class=\"btn corner-controls\" ng-click=\"cancel()\">Close (Esc)</button><h4>Download CSV data</h4><p>Data for the currently plotted time range will be downloaded.</p><br><p ng-if=\"datasets.length > 1\"><a href=\"javascript:void(0)\" ng-click=\"setAllSelected(true)\">Select all</a> | <a href=\"javascript:void(0)\" ng-click=\"setAllSelected(false)\">Deselect all</a></p><p ng-repeat=\"d in datasets track by $index\"><label ng-disabled=\"datasetIsEmpty(d)\" title=\"{{datasetIsEmpty(d) ? \'Cannot download; no data available\' : \'\'}}\"><input type=\"checkbox\" ng-model=\"formData.selectedDatasets[ $index ]\" ng-disabled=\"datasetIsEmpty(d)\"> {{d.name}} <span ng-if=\"d.offset != 0\">(offset: {{d.offset.replace(\' \',\'\')}})</span></label></p><button class=\"btn btn-primary\" type=\"button\" ng-click=\"downloadSelectedDatasets()\" ng-disabled=\"!someAreSelected()\">Download data</button></div></div>");
$templateCache.put("event_table/event_table.html","<div class=\"event-table frame-contents\"><div class=\"table-container\" ng-style=\"tableStyle\"><table><tbody><tr ng-repeat=\"(index, row) in tableData\"><td width=\"1\">{{row[0]}}</td><td>{{row[1]}}</td></tr></tbody></table></div></div>");
$templateCache.put("events_modal/events_modal.html","<div class=\"modal-body events-modal\"><h3>Event details</h3><p><b>Type:</b> {{$ctrl.eventDetails.type.label}} <span ng-if=\"$ctrl.eventDetails.type.label.toLowerCase() !== $ctrl.eventDetails.type.name.toLowerCase()\">({{$ctrl.eventDetails.type.name}})</span></p><p ng-if=\"$ctrl.eventDetails.end\"><b>Start:</b> {{$ctrl.eventDetails.startFormatted}}<br><b>End:</b> {{$ctrl.eventDetails.endFormatted}}</p><p ng-if=\"!$ctrl.eventDetails.end\"><b>Time:</b> {{$ctrl.eventDetails.startFormatted}}</p><br><h4>Properties</h4><p ng-repeat=\"(key, value) in $ctrl.eventDetails.info\" ng-if=\"value.length > 0\"><b>{{key}}:</b> {{value}}</p></div>");
$templateCache.put("metadata_modal/metadata_modal.html","<metadata-display></metadata-display>");
$templateCache.put("plot_frame/header_button_group.html","<div class=\"ui-buttons-zoom fixed-zoom-group button-group dropdown-group\"><div class=\"header-button timerange-btn\" title=\"Set time range\" ng-click=\"openTimeRangeModal()\" ng-disabled=\"loading\"></div><div class=\"header-button header-button-small zoom-in-btn\" title=\"Zoom in\" ng-click=\"zoomIn()\" ng-disabled=\"loading\"></div><div class=\"header-button header-button-small zoom-out-btn\" title=\"Zoom out\" ng-click=\"zoomOut()\" ng-disabled=\"loading\"></div><div class=\"header-button header-button-small pan-left-btn\" title=\"Pan left\" ng-click=\"panLeft()\" ng-disabled=\"loading\"></div><div class=\"header-button header-button-small pan-right-btn\" title=\"Pan right\" ng-click=\"panRight()\" ng-disabled=\"loading\"></div><div class=\"header-button header-button-small undo-zoom\" title=\"Undo zoom\" ng-click=\"undoZoom()\" ng-disabled=\"history.length < 1 || loading\"></div><div class=\"header-button header-button-small zoom-menu\" title=\"More zoom levels\" ng-click=\"toggleZoomMenu($event)\" ng-disabled=\"loading\"></div><div ng-click=\"$event.clickedZoomMenu = true\" class=\"dropdown\"><div ng-show=\"zoomMenuOpen\"><ul><li ng-click=\"setTimeRangeByDuration(14400000)\">4 Hours</li><li ng-click=\"setTimeRangeByDuration(28800000)\">8 Hours</li><li ng-click=\"setTimeRangeByDuration(43200000)\">12 Hours</li><li ng-click=\"setTimeRangeByDuration(86400000)\">24 Hours</li><li ng-click=\"setTimeRangeByDuration(172800000)\">48 Hours</li></ul></div></div></div><div class=\"ui-buttons-resolution header-button increase-resolution-btn\" ng-show=\"!dataError && !fullResolution && datasetType === DatasetTypes.ANALOG\" title=\"Increase data resolution\" ng-class=\"{\'disabled\': !increaseResolutionButtonIsEnabled() }\" ng-click=\"increaseResolution()\"></div><div class=\"ui-buttons-filter filter-button-group button-group dropdown-group\" ng-show=\"datasetType !== DatasetTypes.EVENT_TABLE\"><div class=\"header-button btn-padding\" ng-class=\"{\'filter-btn\': !filtersAreActive(), \'active-filter-btn\': filtersAreActive()}\" title=\"Filter data\" ng-click=\"toggleFilterMenu($event)\" ng-disabled=\"loading\"></div><div ng-click=\"$event.clickedFilterMenu = true\" class=\"dropdown\" ng-if=\"filterMenuOpen\"><div class=\"filter-options-group\"><p ng-if=\"datasets.length > 1\" class=\"overplot-filter-note\">These settings will apply to all overplotted items.</p><label ng-class=\"{\'disabled\': datasetType !== DatasetTypes.ANALOG}\" title=\"If two adjacent points differ by more than a given value, the latter point will be removed\"><input type=\"checkbox\" ng-model=\"filterSelection.delta.enabled\" ng-disabled=\"datasetType !== DatasetTypes.ANALOG\">Delta</label><div ng-if=\"filterSelection.delta.enabled\" class=\"filter-details\"><label>Max change:<br><input type=\"number\" ng-model=\"filterSelection.delta.value\"></label></div><label ng-class=\"{\'disabled\': datasetType !== DatasetTypes.ANALOG}\" title=\"Any points which fall outside of the defined min/max bounds will be removed\"><input type=\"checkbox\" ng-model=\"filterSelection.minmax.enabled\" ng-disabled=\"datasetType !== DatasetTypes.ANALOG\">Min/max</label><div ng-if=\"filterSelection.minmax.enabled\" class=\"filter-details\"><label>Min:<br><input type=\"number\" ng-model=\"filterSelection.minmax.min\"></label> <label>Max:<br><input type=\"number\" ng-model=\"filterSelection.minmax.max\"></label></div><label title=\"Points which have the same value as the preceding point will be removed\"><input type=\"checkbox\" ng-model=\"filterSelection.change.enabled\">On change</label><p class=\"text-danger\" ng-if=\"filterError\">{{filterError}}</p><button class=\"btn btn-primary\" ng-click=\"applyFilters()\">Apply</button></div></div></div><div class=\"ui-buttons-info header-button metadata-btn\" title=\"Show metadata\" ng-click=\"openInfoModal()\"></div><div class=\"ui-buttons-download download-button-group button-group dropdown-group\" ng-show=\"downloadButtonEnabled()\"><div class=\"header-button download-btn\" title=\"Download data/image\" ng-click=\"toggleDownloadMenu($event)\"></div><div class=\"dropdown\" ng-if=\"downloadMenuOpen\"><ul><li ng-click=\"downloadCSV()\">CSV data</li><li ng-click=\"downloadImage(\'svg\')\" ng-show=\"datasetType !== DatasetTypes.EVENT_TABLE\">SVG image</li><li ng-click=\"downloadImage(\'png\')\" ng-show=\"datasetType !== DatasetTypes.EVENT_TABLE\">PNG image</li><li ng-click=\"downloadImage(\'pdf\')\" ng-show=\"datasetType !== DatasetTypes.EVENT_TABLE\">PDF</li></ul></div></div>");
$templateCache.put("plot_frame/plot_frame.html","<div class=\"unselectable\" ng-class=\"{\'collapsed\': uiOptions.collapsed, \'color-theme-light\': uiOptions.colorTheme == \'light\', \'color-theme-dark\': uiOptions.colorTheme == \'dark\' }\" ng-click=\"closeAll()\"><div class=\"plot-header flex-container-row\" ng-class=\"{\'use-global-settings\': menuOptions.menuDisabled}\" sv-handle=\"\"><div class=\"plot-menu-btn flex-nogrow\" ng-hide=\"uiOptions.collapsed\" ng-click=\"togglePlotMenu($event)\"></div><div class=\"chart-title flex-container-row flex\" title=\"{{name}} - {{desc}}\" ng-hide=\"error==\'badFormat\'\"><span class=\"truncate\">{{name}}</span> <span class=\"chart-desc truncate flex\">{{desc}}</span></div><span class=\"noti-bubble flex\" ng-if=\"redViolations > 0\" title=\"{{redViolations}} {{redViolations === 1 ? \'point\' : \'points\'}} within red limit areas\">{{redViolations}}</span> <span class=\"noti-bubble yellow flex\" ng-if=\"yellowViolations > 0\" title=\"{{yellowViolations}} {{yellowViolations === 1 ? \'point\' : \'points\'}} within yellow limit areas\">{{yellowViolations}}</span><div class=\"flex-nogrow header-button-group\" ng-mousedown=\"$event.stopPropagation()\"><div header-button-group=\"\" class=\"button-group\" ng-show=\"elementWidth > 620 && !uiOptions.collapsed\"></div><div class=\"header-button plusminus-btn\" ng-class=\"{\'collapsed\': uiOptions.collapsed}\" ng-click=\"setUiOptions({collapsed: !uiOptions.collapsed})\" title=\"Toggle plot collapse\"></div><div class=\"header-button close-btn\" ng-click=\"removePlot()\" title=\"Remove plot\"></div></div></div><div plot-menu=\"\" class=\"plot-menu\" open=\"plotMenuOpen\" menu-btn=\"plotMenuBtn\"><ul><li class=\"ui-menu-disable dark-menu\"><label><span>{{uiOptions.disableMenuLabelText}}</span> <input type=\"checkbox\" ng-checked=\"menuOptions.menuDisabled\" ng-click=\"setMenuOptions({menuDisabled: !menuOptions.menuDisabled})\"></label></li><li class=\"ui-menu-datasets\" ng-show=\"datasetType !== DatasetTypes.EVENT_TABLE && (plotList || showChangeDatasetsMenuItem())\"><label><span>Datasets</span><div class=\"arrow\"></div></label><ul><li class=\"ui-menu-datasets-add\" ng-show=\"showChangeDatasetsMenuItem()\"><label ng-click=\"onChangeDatasetsClicked()\"><span>Add/remove/change datasets&hellip;</span></label></li><li class=\"ui-menu-datasets-split\" ng-show=\"plotList\" ng-class=\"{disabled: !isOverplot()}\"><label ng-click=\"splitDatasets()\"><span>Split into separate plots</span></label></li><li class=\"ui-menu-datasets-combine\" ng-show=\"plotList\" ng-class=\"{\'disabled\': !plotList.some( canCombine )}\"><label><span>Combine plot with</span><div class=\"arrow\"></div></label><ul class=\"plot-list scrolling-menu\"><li ng-repeat=\"(i, plot) in plotList\" ng-if=\"canCombine( plot )\"><label title=\"{{plot.plotObj.name}} &#013; {{plot.plotObj.desc}}\" ng-click=\"absorbDatasetsOf( plot )\"><span><span>{{plot.plotObj.name}}</span><br><span class=\"desc\">{{plot.plotObj.desc}}</span></span></label></li></ul></li></ul></li><li class=\"ui-menu-overplot\" ng-class=\"{disabled: !isOverplot()}\"><label><span>Overplot settings</span><div class=\"arrow\"></div></label><ul><li class=\"ui-menu-limits-selection\" ng-class=\"{disabled: !enableLimitsSelection || !menuOptions.view.limits}\" title=\"{{menuOptions.view.limits ? \'\' : \'Limits are currently hidden. Turn on limits via [View->Limits] to enable this option.\'}}\"><label><span>Show limits for:</span><div class=\"arrow\"></div></label><ul class=\"plot-list scrolling-menu dataset-selection\"><li ng-repeat=\"(i, ds) in datasets\"><label title=\"{{ds.name}} &#013; {{ds.desc}}\"><span><span>{{ds.name}}</span><br><span class=\"desc\">{{ds.desc}}</span> <input type=\"radio\" ng-checked=\"menuOptions.selectedLimitsIndex === i\" ng-click=\"setMenuOptions({selectedLimitsIndex:i})\"></span></label></li></ul></li><li class=\"ui-menu-xaxis-selection\" ng-class=\"{disabled: !hasOffsetDatasets()}\"><label><span>Show x-axis for:</span><div class=\"arrow\"></div></label><ul class=\"plot-list scrolling-menu dataset-selection\"><li ng-repeat=\"(i, ds) in datasets\"><label title=\"{{ds.name}} &#013; {{ds.desc}}\"><span><span>{{ds.name}}</span><br><span class=\"desc\">Offset: {{ds.offset ? ds.offset.replace(\' \',\'\') : \'none\'}}</span> <input type=\"radio\" ng-checked=\"menuOptions.selectedXAxisIndex === i\" ng-click=\"setMenuOptions({selectedXAxisIndex:i})\"></span></label></li></ul></li></ul></li><li class=\"separator\"></li><li class=\"ui-menu-view\" ng-show=\"datasetType !== DatasetTypes.EVENT_TABLE\" ng-class=\"{\'disabled\': menuOptions.menuDisabled}\"><label><span>View</span><div class=\"arrow\"></div></label><ul><li class=\"ui-menu-view-navigator\"><label><span>Navigator</span> <input type=\"checkbox\" ng-checked=\"menuOptions.view.navigator\" ng-click=\"setMenuOptions({view:{navigator:!menuOptions.view.navigator}})\"></label></li><li class=\"ui-menu-view-scrollbar\"><label><span>Scroll bar</span> <input type=\"checkbox\" ng-checked=\"menuOptions.view.scrollbar\" ng-click=\"setMenuOptions({view:{scrollbar:!menuOptions.view.scrollbar}})\"></label></li><li class=\"ui-menu-view-limits\" ng-class=\"{\'disabled\': datasetType === DatasetTypes.DISCRETE}\"><label><span>Limit areas</span> <input type=\"checkbox\" ng-disabled=\"datasetType === DatasetTypes.DISCRETE\" ng-checked=\"menuOptions.view.limits\" ng-click=\"setMenuOptions({view:{limits:!menuOptions.view.limits}})\"></label></li><li class=\"ui-menu-view-limit-violation-flags\"><label><span>Limit violation coloring</span> <input type=\"checkbox\" ng-checked=\"menuOptions.view.limitViolationFlags\" ng-click=\"setMenuOptions({view:{limitViolationFlags:!menuOptions.view.limitViolationFlags}})\"></label></li><li class=\"ui-menu-view-events\" ng-class=\"{\'disabled\': !uiOptions.eventsURL}\"><label><span>Events</span> <input type=\"checkbox\" ng-checked=\"menuOptions.view.events\" ng-click=\"setMenuOptions({view:{events:!menuOptions.view.events}})\" ng-disabled=\"!uiOptions.eventsURL\"></label></li><li class=\"ui-menu-view-eventtypes\" ng-class=\"{disabled: !menuOptions.view.events}\"><label><span>Event types</span><div class=\"arrow\"></div></label><ul class=\"scrolling-menu\"><li ng-repeat=\"(i, type) in eventsData.types\"><label title=\"{{type.label}}\"><span class=\"hide-overflow\">{{type.label}}</span> <input type=\"checkbox\" ng-checked=\"menuOptions.view.eventTypes.indexOf(type.id) >= 0\" ng-click=\"toggleEventType(type.id)\"></label></li></ul></li><li class=\"ui-menu-view-legend\"><label><span>Legend</span> <input type=\"checkbox\" ng-checked=\"menuOptions.view.legend\" ng-click=\"setMenuOptions({view:{legend:!menuOptions.view.legend}})\"></label></li><li class=\"ui-menu-view-horizontal-crosshair\"><label><span>Horizontal crosshair</span> <input type=\"checkbox\" ng-checked=\"menuOptions.view.horizontalCrosshair\" ng-click=\"setMenuOptions({view:{horizontalCrosshair:!menuOptions.view.horizontalCrosshair}})\"></label></li></ul></li><li class=\"ui-menu-yaxis\" ng-class=\"{\'disabled\': menuOptions.menuDisabled}\" ng-show=\"datasetType !== DatasetTypes.EVENT_TABLE\"><label><span>Y-axis</span><div class=\"arrow\"></div></label><ul><li class=\"ui-menu-yaxis-scaling\"><label><span>Scaling</span><div class=\"arrow\"></div></label><ul><li ng-class=\"{\'disabled\': datasetType !== DatasetTypes.ANALOG}\" class=\"ui-menu-yaxis-scaling-auto\"><label><span>Auto</span> <input type=\"radio\" ng-checked=\"menuOptions.yAxis.scaling.type == \'auto\'\" ng-click=\"setMenuOptions({yAxis:{scaling:{type:\'auto\'}}})\"></label></li><li ng-class=\"{\'disabled\': datasetType !== DatasetTypes.ANALOG || menuOptions.selectedLimitsIndex == undefined || metadata[menuOptions.selectedLimitsIndex].Limits.Yellow.Low == undefined}\" class=\"ui-menu-yaxis-scaling-yellow-limits\"><label><span>Scale to yellow limits</span> <input type=\"radio\" ng-disabled=\"menuOptions.selectedLimitsIndex == undefined || metadata[menuOptions.selectedLimitsIndex].Limits.Yellow.Low == undefined\" ng-checked=\"menuOptions.yAxis.scaling.type == \'yellow\'\" ng-click=\"setMenuOptions({yAxis:{scaling:{type:\'yellow\'}}})\"></label></li><li ng-class=\"{\'disabled\': datasetType !== DatasetTypes.ANALOG || menuOptions.selectedLimitsIndex == undefined || metadata[menuOptions.selectedLimitsIndex].Limits.Red.Low == undefined}\" class=\"ui-menu-yaxis-scaling-red-limits\"><label><span>Scale to red limits</span> <input type=\"radio\" ng-disabled=\"menuOptions.selectedLimitsIndex == undefined || metadata[menuOptions.selectedLimitsIndex].Limits.Red.Low == undefined\" ng-checked=\"menuOptions.yAxis.scaling.type == \'red\'\" ng-click=\"setMenuOptions({yAxis:{scaling:{type:\'red\'}}})\"></label></li><li ng-class=\"{\'disabled\': datasetType !== DatasetTypes.ANALOG}\" class=\"ui-menu-yaxis-scaling-custom\"><label><span>Custom Scaling</span> <input type=\"radio\" ng-disabled=\"datasetType === DatasetTypes.DISCRETE\" ng-checked=\"menuOptions.yAxis.scaling.type == \'custom\'\" ng-click=\"setMenuOptions({yAxis:{scaling:{type:\'custom\'}}})\"></label></li><li ng-class=\"{ \'disabled\': menuOptions.yAxis.scaling.type !==\'custom\' }\" class=\"ui-menu-yaxis-scaling-custom-inputs\"><label><div class=\"half-label\"><span>Low:</span> <input style=\"width: 4em; max-width: 50%\" type=\"number\" ng-model=\"menuControls.yAxisScalingLow\"></div><div class=\"half-label\"><span>High:</span> <input style=\"width: 4em; max-width: 50%\" type=\"number\" ng-model=\"menuControls.yAxisScalingHigh\"></div></label></li><li ng-class=\"{ \'disabled\': menuOptions.yAxis.scaling.type !== \'custom\' }\"><label class=\"y-axis-scaling\"><div class=\"text-danger-light scaling-error\">{{ yAxisScalingError }}</div><button class=\"btn btn-primary\" ng-click=\"setMenuOptions({yAxis:{scaling:{low:menuControls.yAxisScalingLow,high:menuControls.yAxisScalingHigh}}})\">Apply</button></label></li></ul></li><li class=\"ui-menu-yaxis-labels\"><label><span>Labels</span><div class=\"arrow\"></div></label><ul><li ng-class=\"{\'disabled\': datasetType !== DatasetTypes.DISCRETE}\"><label><span>Hide unused discrete labels</span> <input type=\"checkbox\" ng-checked=\"menuOptions.yAxis.labels.hideUnusedDiscreteLabels\" ng-click=\"setMenuOptions({yAxis:{labels:{hideUnusedDiscreteLabels: !menuOptions.yAxis.labels.hideUnusedDiscreteLabels}}})\" ng-disabled=\"datasetType !== DatasetTypes.DISCRETE\"></label></li><li ng-class=\"{\'disabled\': datasetType !== DatasetTypes.DISCRETE || !discreteFormattersEnabled}\"><label><span>Show numeric discrete values</span> <input type=\"checkbox\" ng-checked=\"menuOptions.yAxis.labels.showNumericDiscreteValues\" ng-click=\"setMenuOptions({yAxis:{labels:{showNumericDiscreteValues: !menuOptions.yAxis.labels.showNumericDiscreteValues}}})\" ng-disabled=\"datasetType !== DatasetTypes.DISCRETE || !discreteFormattersEnabled\"></label></li></ul></li></ul></li><li class=\"ui-menu-date-formatting\" ng-class=\"{\'disabled\': menuOptions.menuDisabled}\"><label><span ng-if=\"datasetType !== DatasetTypes.EVENT_TABLE\">X-axis labels</span> <span ng-if=\"datasetType === DatasetTypes.EVENT_TABLE\">Date formatting</span><div class=\"arrow\"></div></label><ul><li class=\"ui-menu-date-formatting-auto\"><label><span>Auto</span> <input type=\"radio\" ng-checked=\"menuOptions.timeLabels.format === \'auto\'\" ng-click=\"setMenuOptions({timeLabels:{format:\'auto\'}})\"></label></li><li class=\"ui-menu-date-formatting-t0\"><label><span>Seconds since t<sub>0</sub></span> <input type=\"radio\" ng-checked=\"menuOptions.timeLabels.format === \'secondsSinceT0\'\" ng-click=\"setMenuOptions({timeLabels:{format:\'secondsSinceT0\'}})\"></label></li><li class=\"ui-menu-date-formatting-raw\"><label><span>Raw</span> <input type=\"radio\" ng-checked=\"menuOptions.timeLabels.format === \'raw\'\" ng-click=\"setMenuOptions({timeLabels:{format:\'raw\'}})\"></label></li></ul></li><li class=\"ui-menu-data-display\" ng-show=\"datasetType !== DatasetTypes.EVENT_TABLE\" ng-class=\"{\'disabled\': menuOptions.menuDisabled}\"><label><span>Data display</span><div class=\"arrow\"></div></label><ul><li class=\"ui-menu-data-display-series\"><label><span>Display series as</span><div class=\"arrow\"></div></label><ul><li><label><span>Lines only</span> <input type=\"radio\" ng-checked=\"menuOptions.dataDisplay.seriesDisplayMode === \'lines\'\" ng-click=\"setMenuOptions({dataDisplay:{seriesDisplayMode:\'lines\'}})\"></label></li><li><label><span>Points only</span> <input type=\"radio\" ng-checked=\"menuOptions.dataDisplay.seriesDisplayMode === \'points\'\" ng-click=\"setMenuOptions({dataDisplay:{seriesDisplayMode:\'points\'}})\"></label></li><li><label><span>Lines and points</span> <input type=\"radio\" ng-checked=\"menuOptions.dataDisplay.seriesDisplayMode === \'linesAndPoints\'\" ng-click=\"setMenuOptions({dataDisplay:{seriesDisplayMode:\'linesAndPoints\'}})\"></label></li></ul></li><li class=\"ui-menu-data-display-gaps\"><label><span>Gaps</span><div class=\"arrow\"></div></label><ul><li><label title=\"Visualize gaps in data as breaks in the line chart\"><span>Allow gaps</span> <input type=\"checkbox\" ng-checked=\"menuOptions.dataDisplay.gaps.enabled\" ng-click=\"setMenuOptions({dataDisplay:{gaps:{enabled: !menuOptions.dataDisplay.gaps.enabled}}})\"></label></li><li ng-class=\"{ \'disabled\': !menuOptions.dataDisplay.gaps.enabled }\"><label title=\"For periods of data with an even cadence, if at least [threshold] consecutive points are missing, a gap will be shown\"><span>Threshold ratio</span> <input class=\"gap-threshold-input\" type=\"number\" min=\"1\" ng-model=\"menuControls.gapThreshold\"></label></li><li ng-class=\"{ \'disabled\': !menuOptions.dataDisplay.gaps.enabled }\"><label><button class=\"btn btn-primary\" ng-click=\"setMenuOptions({dataDisplay:{gaps:{threshold: menuControls.gapThreshold}}})\">Apply</button></label></li></ul></li><li class=\"ui-menu-data-display-minmax-range\" ng-class=\"{\'disabled\': datasetType === DatasetTypes.DISCRETE}\"><label><span>Show min/max range</span> <input type=\"checkbox\" ng-checked=\"menuOptions.dataDisplay.showMinMax\" ng-click=\"setMenuOptions({dataDisplay:{showMinMax: !menuOptions.dataDisplay.showMinMax}})\" ng-disabled=\"datasetType === DatasetTypes.DISCRETE\"></label></li><li class=\"ui-menu-data-display-data-grouping\"><label title=\"Automatic averaging and min/max calculations when more points are shown than can fit on the screen\"><span>Data grouping</span> <input type=\"checkbox\" ng-checked=\"menuOptions.dataDisplay.dataGrouping\" ng-click=\"setMenuOptions({dataDisplay:{dataGrouping: !menuOptions.dataDisplay.dataGrouping}})\" ng-disabled=\"datasetType === DatasetTypes.DISCRETE\"></label></li></ul></li><li class=\"ui-menu-zoom-mode\" ng-class=\"{\'disabled\': menuOptions.menuDisabled}\" ng-show=\"datasetType !== DatasetTypes.EVENT_TABLE\"><label><span>Zoom mode</span><div class=\"arrow\"></div></label><ul><li><label title=\"Drag the mouse to zoom in on a range of x-axis values\"><span>X only</span> <input type=\"radio\" ng-checked=\"menuOptions.zoomMode === \'x\'\" ng-click=\"setMenuOptions({zoomMode:\'x\'})\"></label></li><li><label title=\"Drag the mouse to zoom in on a specific rectangle\"><span>X and Y</span> <input type=\"radio\" ng-checked=\"menuOptions.zoomMode === \'xy\'\" ng-click=\"setMenuOptions({zoomMode:\'xy\'})\"></label></li></ul></li><li class=\"ui-menu-color-theme\" ng-class=\"{\'disabled\': menuOptions.menuDisabled}\"><label><span>Color theme</span><div class=\"arrow\"></div></label><ul><li><label><span>Light</span> <input type=\"radio\" ng-checked=\"uiOptions.colorTheme === \'light\'\" ng-click=\"setUiOptions({colorTheme: \'light\'})\"></label></li><li><label><span>Dark</span> <input type=\"radio\" ng-checked=\"uiOptions.colorTheme === \'dark\'\" ng-click=\"setUiOptions({colorTheme: \'dark\'})\"></label></li></ul></li></ul></div><div class=\"frame-contents\" ng-show=\"dataError || loading\" uib-collapse=\"uiOptions.collapsed\"><div class=\"overlay-container\" ng-style=\"frameContentStyle\"><div ng-show=\"dataError == \'Server Error\'\"><p>{{dataErrorString}}</p><div class=\"no-data-buttons\"><button class=\"btn btn-primary\" ng-click=\"downloadAllDatasets()\">Retry</button></div></div><div ng-show=\"dataError == \'noData\'\"><p>{{dataErrorString}}</p><div class=\"no-data-buttons\" ng-show=\"noDataErrorKeys.length > 0 && datasets.length > noDataErrorKeys.length\"><button class=\"btn btn-primary\" ng-click=\"removeDatasets( noDataErrorKeys )\">Remove empty dataset<span ng-if=\"noDataErrorKeys.length > 1\">s</span> from plot</button> <button class=\"btn\" ng-click=\"dataError = \'\'\">Dismiss</button></div></div><div ng-show=\"loading\"><div class=\"loading-bar-wrapper\"><div class=\"loading-bar-mask\" style=\"width:{{100 - loadingProgress.percent}}%\"></div><div class=\"loading-kb\">{{loadingProgress.kb}}kb</div></div><p>Retrieving data from server...</p></div></div></div><highchart class=\"lasp-chart\" ng-show=\"!dataError && !loading && (datasetType === DatasetTypes.ANALOG || datasetType === DatasetTypes.DISCRETE)\" ng-class=\"{\'chart-loading\': loading}\" uib-collapse=\"uiOptions.collapsed\" chart=\"chart\" highchart-scope=\"highchartScope\" frame-scope=\"plotObj\" ng-dblclick=\"resetZoom();\"></highchart><event-table ng-show=\"!dataError && !loading && datasetType === DatasetTypes.EVENT_TABLE\" ng-class=\"{\'chart-loading\': loading}\" uib-collapse=\"uiOptions.collapsed\" event-table-scope=\"eventTableScope\" frame-scope=\"plotObj\"></event-table><span class=\"more-options-button\" ng-click=\"setUiOptions({showBottomMenu: !uiOptions.showBottomMenu})\" ng-if=\"elementWidth < 620 && !uiOptions.collapsed && !uiOptions.showBottomMenu\" title=\"more options\"><div class=\"arrow\"></div></span> <span class=\"more-options-button reverse\" ng-click=\"setUiOptions({showBottomMenu: !uiOptions.showBottomMenu})\" ng-if=\"elementWidth < 620 && !uiOptions.collapsed && uiOptions.showBottomMenu\" title=\"less options\"><div class=\"arrow\"></div></span><div class=\"bottom-menu\" ng-show=\"uiOptions.showBottomMenu && elementWidth < 620 && !uiOptions.collapsed\"><div class=\"flex-container-row\"><span class=\"flex\"></span><div class=\"flex-nogrow header-button-group\"><div header-button-group=\"\" class=\"button-group\"></div></div></div></div></div>");
$templateCache.put("timerange_modal/timerange_modal.html","<div class=\"modal-body-wrapper download-modal\"><div class=\"modal-body\"><button class=\"btn corner-controls\" ng-click=\"cancel()\">Close (Esc)</button><h4>Time range</h4><datepicker-minimal date=\"date\" config=\"datePickerConfig\"></datepicker-minimal><p ng-if=\"hasOffsetDatasets\"><i>Datasets with time offsets will retain their offset relative to the above time.</i></p><button class=\"btn btn-primary\" ng-click=\"ok()\">Apply</button></div></div>");}]);
