app.config(function ($stateProvider){
	$stateProvider.state('dashboard',{
		url: '/dashboard/:userId',
		templateUrl: 'js/user-dashboard/dashboard.html',
		controller: 'DashCtrl',
		resolve: {
			userGames: function(QuestFactory, $stateParams){
				return QuestFactory.getUserQuests($stateParams.userId);
			}
		},
		data: {
            authenticate: true
        }
	});
});

app.controller('DashCtrl', function ($scope, userGames, Session){
	$scope.games = [];
	$scope.games = userGames.map(function(g) { 
		g.showDetail = false;
		return g;
	});
	
	$scope.parentClick = function(index) {
		var game = $scope.games[index]
		game.showDetail = !game.showDetail;
	}
})

app.filter('trimSummary', function() {
	// JO:
	// TODO: replace this with a regular expression that gets the first three words
	return function(str){
		return str.slice(0, 30) + '...';
	}
})