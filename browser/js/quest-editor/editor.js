app.config(function ($stateProvider){
	$stateProvider.state('editor',
	{
		url: '/editor/:id',
		templateUrl: 'js/quest-editor/editor.html',
		controller: 'EditorCtrl',
        resolve: {
        	quest: function(GamesFactory, $stateParams){
        		return $stateParams.id !== "" ?
					GamesFactory.getOneGame($stateParams.id) : 
					undefined;
        	}
        },
		data: {
            authenticate: true
        }
	});
});

app.controller('EditorCtrl', function ($scope, quest, $uibModal, $state) {
	// no previously created quest is being loaded in the editor
	if (!quest){
		// load modal
		var newQuestModal = $uibModal.open({
	    	animation: true,
	    	templateUrl: 'js/quest-modal/newQuestModal.html',
	    	controller: 'QuestModalCtrl'
	    }).result.then(function(newQuest){
	    	// attach modal info to scope as the quest
	    	$scope.quest = newQuest;
	    }, function() {
	    	// if clicked out of, redirect to dashboard.
	    	$state.go('dashboard');
	    })
	
	}

	$scope.quest = {};

	// mapStatesDock is loaded from the states

	// statesEditor is loaded with the latest state.




	// on addition of a mapState, add to the scope quest object.

	// on change of the quest object - do a put request to update

})