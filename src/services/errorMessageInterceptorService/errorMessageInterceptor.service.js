(function() {
angular
.module("beryllium")
.service("errorMessageInterceptor", ['$q', function($q) {
    var service = this;

    this.request = function(config) {
        $('#connection-error-message').css('display', 'none');
        return config;
    };

    this.requestError = function(config) {
        $('#connection-error-message')
            .show()
            .css('display', 'block');
        return $q.reject(config);
    };

    this.response = function(response) {
        $('#connection-error-message').css('display', 'none');
        return response;
    };

    this.responseError = function(response) {
        if( response.status === -1 ) {
            // Per angular docs, "-1 usually means that the request was aborted".
            // In our case, we'll frequently abort requests if a new one is made in
            // its place; e.g. the user changes the date while the previous date is
            // still loading. That's not an error, so we should just ignore it.
            return;
        }

        $('#connection-error-message')
            .show()
            .css('display', 'block');
        return $q.reject(response);
    };
}])
})();