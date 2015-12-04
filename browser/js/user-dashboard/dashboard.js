app.config(function ($stateProvider){
	$stateProvider.state('dashboard',{
		url: '/dashboard/:userId',
		templateUrl: 'js/user-dashboard/dashboard.html',
		controller: 'DashCtrl',
		resolve: {
			userQuests: function(QuestFactory, $stateParams){
				return QuestFactory.getUserQuests($stateParams.userId);
			}
		},
		data: {
            authenticate: true
        }
	});
});

app.controller('DashCtrl', function ($scope, userQuests, Session){
	$scope.quests = [];
	$scope.quests = userQuests.map(function(g) { 
		g.showDetail = false;
		return g;
	});
	
	$scope.parentClick = function(index) {
		var quest = $scope.quests[index]
		quest.showDetail = !quest.showDetail;
	}
})

app.filter('trimSummary', function() {
	// JO:
	// TODO: replace this with a regular expression that gets the first three words
	return function(str){
		return str.slice(0, 30) + '...';
	}
})