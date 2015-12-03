app.config(function ($stateProvider){
	$stateProvider.state('editor',
	{
		url: '/editor/:id',
		templateUrl: 'js/quest-editor/editor.html',
		controller: 'EditorCtrl',
    resolve: {
    	quest: function(QuestFactory, $stateParams){
    		return $stateParams.id !== "" ?
			QuestFactory.getOneQuest($stateParams.id) : 
			undefined;
    	}
    },
		data: {
        authenticate: true
    }
	});
});

app.controller('EditorCtrl', function ($scope, quest, $uibModal, $state, QuestFactory, $stateParams) {
	
	$scope.quest = quest;
	$scope.saveQuest = function() {
		QuestFactory.update($scope.quest)
		console.log("quest", $scope.quest)
	}

	// no previously created quest is being loaded in the editor
	if (!quest){
		// load modal
		var newQuestModal = $uibModal.open({
	    	animation: true,
	    	templateUrl: 'js/quest-modal/newQuestModal.html',
	    	controller: 'QuestModalCtrl'
	    }).result.then(function(newQuest){
	    	// attach modal info to scope as the quest
	    	// $scope.quest = newQuest;
			$scope.quest = {states: [{name: "state1"}, {name: "state2"}]};
	    }, function() {
	    	// if clicked out of, redirect to dashboard.
	    	$state.go('dashboard');
	    })
	}

	$scope.quest = quest;
})