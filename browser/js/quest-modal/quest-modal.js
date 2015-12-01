app.controller('QuestModalCtrl', function($scope, $state, $uibModalInstance){
	// return form data...

	$scope.makeQuest = function () {
		$scope.newQuest.states = [{name: "start"}]
    	$uibModalInstance.close($scope.newQuest);
  	};	

  	$scope.cancelQuest = function() {
  		$uibModalInstance.dismiss('cancel');
  		$state.go('dashboard');
  	}
})