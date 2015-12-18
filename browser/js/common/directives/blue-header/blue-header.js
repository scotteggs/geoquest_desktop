app.directive('blueHeader', function(AuthService, $state) {
	
	return {
		restrict: 'E',
		scope: {
			head: '@',
			small: '@'
		},
		templateUrl: 'js/common/directives/blue-header/blue-header.html',
		link: function(scope) {

			scope.user = null;

			var setUser = function () {
                AuthService.getLoggedInUser().then(function (user) {
                    scope.user = user;
                });
            };

            setUser();

			scope.logout = function() {
				AuthService.logout()
				.then(function() {
					$state.go('home');
				});
			};

		}
	};

});