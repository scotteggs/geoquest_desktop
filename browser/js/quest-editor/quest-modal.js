app.controller('QuestModalCtrl', function($scope, $state, $uibModalInstance){
	// return form data...
	$scope.newQuest = {name: "NewQuest - Test"};

	$scope.makeQuest = function () {
    	$uibModalInstance.close($scope.newQuest);
  	};	

  	$scope.cancelQuest = function() {
  		$uibModalInstance.dismiss('cancel');
  		$state.go('dashboard');
  	}
})