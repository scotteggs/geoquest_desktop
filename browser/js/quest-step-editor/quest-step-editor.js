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
	$scope.quest.questSteps.forEach( function (step, index) {
		if (step._id === $stateParams.questStepId) $scope.quest.idx = index;
	})
	$scope.questStep = $scope.quest.questSteps[$scope.quest.idx];



	console.log("index", $scope.questStep);
	

	//remove first state for safe keeping
	$scope.openingState = $scope.quest.questSteps.shift()
	//function to switch states within mapState editor
	$scope.switchStep = function (clickedStep) {
	//updates current mapState
		QuestFactory.update($scope.quest)
		.then(function () {
			//redirect to the clicked mapstate
			$state.go('editor.questStep', {questStepId: clickedStep._id});	
		})
	};
	// //function to save and go to parent state
	// $scope.saveQuestAndStates = function () {
	// 	//save current mapState
	// 	MapStateFactory.update($scope.mapstate)
	// 	.then(function () {
	// 		// replace first element from mapstates array (removed on load)
	// 		$scope.quest.mapstates.unshift($scope.openingState)
	// 		QuestFactory.update($scope.quest)})
	// 	.then(function() {
	// 		//reload resets editorVisible to True
	// 		$state.go('editor', {id: $scope.quest._id}, {reload: true});
	// 	})
	// };
	//function to set map to either target region or map starting point if no target region
	var mapView = function () {
		if ($scope.questStep.targetRegion.locationPoints.length ===2) {
			return($scope.questStep.targetRegion.locationPoints)
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
	if ($scope.questStep.targetRegion.locationPoints.length === 2) {
		var currentRegion = L.circle($scope.questStep.targetRegion.locationPoints,$scope.questStep.targetRegion.radius);
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
    $scope.questStep.targetRegion.locationPoints = [layer._latlng.lat,layer._latlng.lng];
    $scope.questStep.targetRegion.radius = layer._mRadius
    //declare new object based on propertied drawn and add to map
    circle = L.circle([layer._latlng.lat,layer._latlng.lng], layer._mRadius);
    questStepMap.addLayer(circle);
	});



})
