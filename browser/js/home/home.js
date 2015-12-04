app.config(function ($stateProvider) {
	$stateProvider.state('home', {
		url: '/',
		controller: 'HomeController',
		data: {
        authenticate: true
    }
	})
})

app.controller('HomeController', function ($state, Session) {	
	if (Session.user) {
		$state.go('dashboard', {userId: Session.user._id});
	} else {
		$state.go('auth')
	}
})