app.config(function ($stateProvider) {
$stateProvider.state('editor.questStep', {
		url: '/queststep/:questStepId', 
		templateUrl: 'js/quest-step-editor/quest-step-editor.html',
		controller: 'QuestStepEditController',
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
	})
})


app.controller('QuestStepEditController', function ($stateParams, $scope, $state, quest, QuestFactory){
	$scope.quest = quest;
	//remove first state for safe keeping
	$scope.openingStep = $scope.quest.questSteps.shift()
	$scope.quest.questSteps.forEach( function (step, index) {
		if (step._id === $stateParams.questStepId) $scope.quest.idx = index;
	})
	$scope.questStep = $scope.quest.questSteps[$scope.quest.idx];
	//function to switch states within mapState editor
	$scope.switchStep = function (clickedStep) {
	//updates current mapState
		$scope.quest.questSteps.unshift($scope.openingStep)
		QuestFactory.save($scope.quest)
		.then(function () {
			//redirect to the clicked mapstate
			$state.go('editor.questStep', {questStepId: clickedStep._id});	
		})
	};
	$scope.saveQuestSteps = function (clickedStep) {
	//updates current mapState
		$scope.quest.questSteps.unshift($scope.openingStep)
		QuestFactory.save($scope.quest)
		.then(function () {
			//redirect to the clicked mapstate
			$state.go('editor', {id: $scope.quest._id}, {reload: true});	
		})
	};

	//function to set map to either target region or map starting point if no target region
	var mapView = function () {
		if ($scope.questStep.targetCircle.center.length ===2) {
			return($scope.questStep.targetCircle.center)
		} else {
			return($scope.quest.start)
		}
	};
	//initialize map and set view using mapView function
	var questStepMap = L.map('quest-step-map').setView(mapView(), 15);
	// // //add pirate map tiles
	L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
    maxZoom: 18,
    id: 'scotteggs.o7614jl2',
    accessToken: 'pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw'
	}).addTo(questStepMap);

	// // Initialize the FeatureGroup to store editable layers
	var drawnItems = new L.FeatureGroup();
	questStepMap.addLayer(drawnItems);

	// // Initialize the draw control and pass it the FeatureGroup of editable layers
	var drawControl = new L.Control.Draw({
	    draw: {
	    	polyline: false,
	    	polygon: false,
	    	rectangle: false,
	    	marker: false
	    },
	    edit: {
	        featureGroup: drawnItems
	    }
	});
	questStepMap.addControl(drawControl);
	// //if there is a target region, draw it on the map
	if ($scope.questStep.targetCircle.center.length === 2) {
		var currentRegion = L.circle($scope.questStep.targetCircle.center,$scope.questStep.targetCircle.radius);
		questStepMap.addLayer(currentRegion);
	}
	var circle;
	questStepMap.on('draw:created', function (e) {
	//remove the loaded region then remove any newly drawn circles
  	if(currentRegion) questStepMap.removeLayer(currentRegion);
  	if(circle) questStepMap.removeLayer(circle);
  	var type = e.layerType;
  	var layer = e.layer;
  	//assign target region to properties of drawn object
    $scope.questStep.targetCircle.center = [layer._latlng.lat,layer._latlng.lng];
    $scope.questStep.targetCircle.radius = layer._mRadius
    //declare new object based on propertied drawn and add to map
    circle = L.circle([layer._latlng.lat,layer._latlng.lng], layer._mRadius);
    questStepMap.addLayer(circle);
	});



})
