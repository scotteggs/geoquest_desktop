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

app.controller('EditorCtrl', function ($scope, $stateParams, $uibModal, $state, $rootScope, quest, Session, QuestFactory, AuthService) {
	//variable saved to show/hide quest editor when editing individual states
	$rootScope.editorVisible = true;
	$scope.quest = quest;
	$scope.viewMainMap = true;
	$scope.newQuest = false;
	//if there is no quest, define one
	if(!quest) {
		$scope.newQuest = true;
		$scope.quest= {};
	}

	//update quest and go to dashboard for current user
	$scope.saveQuest = function () {

		if(!$scope.newQuest) {
			return QuestFactory.save($scope.quest)		
			.then(function () {
				$state.go('dashboard', {userId: Session.user._id});
			});
		} else {
			return QuestFactory.saveNew($scope.quest)
			.then(function () {
				$state.go('dashboard', {userId: Session.user._id});
			});
		}
	};
	//go to mapStates editor and hide Quest editor 
	$scope.transitionToMapStateEditor = function () {
		if(!$scope.newQuest) {
			return QuestFactory.save($scope.quest)
			.then(function () {
				if($scope.quest.questSteps.length === 0) {
					$state.go('editor.questStep', {questStepId: null});
				} else { 
					$state.go('editor.questStep', {questStepId: $scope.quest.questSteps[0]._id});	
				}
				$scope.editorVisible = false;
			});
		} else {
			return QuestFactory.saveNew($scope.quest)
			.then(function (savedQuest) {
				$scope.editorVisible = false;
				$state.go('editor.questStep', {id: savedQuest._id, questStepId: null});
			});
		}
	};

	$scope.logout = function () {
        AuthService.logout().then(function () {
           $state.go('home');
        });
    };

	//***********  MAP FUNCTIONS BELOW  ***********************
	var userLocation;
	var targetCircles = [];
	var circleCenters = [];
	var questMap = L.map('quest-map').setView([40.723008,-74.0006327], 13);
	questMap.scrollWheelZoom.disable(); // Really annoying when it happens accidently
	L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
    maxZoom: 18,
    id: 'scotteggs.o7614jl2',
    accessToken: 'pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw'
	}).addTo(questMap);

	// If there are no targetCircles yet created, set map view to user's location
	if (!$scope.quest.questSteps || !$scope.quest.questSteps[0] || !$scope.quest.questSteps[0].targetCircle) {

		questMap.locate().on('locationfound', function (e) {
			userLocation = [e.latitude,e.longitude];
			questMap.setView(userLocation, 14);
		});
	}

	// Redraw all targetCircles for the quest on the map and reset the bounds
	function drawCircles() {
		// Remove all circles
		targetCircles.forEach(function(circle) {
			questMap.removeLayer(circle);
		});
		// Draw a circle for every targetCircle in the quest
		if ($scope.quest.questSteps) {
			$scope.quest.questSteps.forEach(function(step, index) {
				if (step.targetCircle && step.targetCircle.center.length) {
					var center = step.targetCircle.center;
					var radius = step.targetCircle.radius;
					var circle = L.circle(center,radius);
					circle.bindLabel((index+1).toString(), { noHide: true }).addTo(questMap);
					targetCircles.push(circle);
					circleCenters.push(step.targetCircle.center);
				}
			});
			if (circleCenters.length) questMap.fitBounds(circleCenters);
		}
	}
	drawCircles();

});

