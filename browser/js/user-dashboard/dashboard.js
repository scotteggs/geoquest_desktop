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

app.controller('DashCtrl', function ($state, $scope, userQuests, Session, QuestFactory){
	$scope.quests = [];
	$scope.quests = userQuests.map(function(g) { 
		g.showDetail = false;
		return g;
	});

	$scope.goToEditor = function (questClicked) {
		$state.go('editor', {id: questClicked._id}, {reload: true});
	};
	$scope.deleteQuest = function (questClicked) {
		return QuestFactory.delete(questClicked)
		.then( function (deletedQuest) {
			$state.go('dashboard', {userId: Session.user._id}, {reload: true});
		});
	};
	$scope.parentClick = function(index) {
		var quest = $scope.quests[index];
		quest.showDetail = !quest.showDetail;
	};
	$scope.switchActive = function (questClicked) {
		QuestFactory.save(questClicked);
	};

});

