app.config(function ($stateProvider){
	$stateProvider.state('dashboard',
	{
		url: '/dashboard',
		templateUrl: 'js/user-dashboard/dashboard.html'
		controller: 'DashCtrl',
		data: {
            authenticate: true
        }
	})
})

app.controller('DashCtrl', function($scope){
	$scope.createdGames = userGames;
})