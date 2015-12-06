app.config(function ($stateProvider) {
	$stateProvider.state('home', {
		url: '/',
		controller: 'HomeController',
		resolve: {
			requestedUser: function(AuthService) {
				return AuthService.getLoggedInUser()
			}
		}
	})
})

app.controller('HomeController', function ($state, requestedUser) {	
	if (requestedUser) {
		$state.go('dashboard', {userId: requestedUser._id});
	} else {
		$state.go('auth')
	}
	
})