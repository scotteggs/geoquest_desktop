app.config(function ($stateProvider) {
$stateProvider.state('editor.mapstate', {
		url: '/mapstate/:mapstateid', 
		templateUrl: 'js/mapstate-editor/mapstate-editor.html',
		controller: 'MapStateEditController',
		resolve: {
			// mapstate: function(MapStateFactory, $stateParams) {
			// 	return $stateParams.mapstateid !== "" ?
			// 		MapStateFactory.getOne($stateParams.mapstateid) : 
			// 		undefined;
			// },
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


app.controller('MapStateEditController', function ( $scope, $state, quest, QuestFactory){
	// $scope.mapstate = mapstate;
	$scope.quest = quest;
	$scope.step = $scope.quest.questSteps[1];
	console.log($scope.step);
	//remove first state for safe keeping
	// $scope.openingState = $scope.quest.mapstates.shift()
	//function to switch states within mapState editor
	// $scope.switchState = function (clickedState) {
	// 	//updates current mapState
	// 	MapStateFactory.update($scope.mapstate)
	// 	.then(function () {
	// 		//updates any change in the order of states on Quest
	// 		QuestFactory.update($scope.quest)})
	// 	.then(function () {
	// 		//redirect to the clicked mapstate
	// 		$state.go('editor.mapstate', {mapstateid: clickedState._id});	
	// 	})
	// };
	//function to save and go to parent state
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
		if ($scope.step.targetRegion.locationPoints.length ===2) {
			return($scope.step.targetRegion.locationPoints)
		} else {
			return($scope.quest.start)
		}
	};
	//initialize map and set view using mapView function
	var mapStateMap = L.map('mapstate-map').setView(mapView(), 15);
	//add pirate map tiles
	L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
    maxZoom: 18,
    id: 'scotteggs.o7614jl2',
    accessToken: 'pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw'
	}).addTo(mapStateMap);

	// Initialize the FeatureGroup to store editable layers
	var drawnItems = new L.FeatureGroup();
	mapStateMap.addLayer(drawnItems);

	// Initialize the draw control and pass it the FeatureGroup of editable layers
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
	mapStateMap.addControl(drawControl);
	//if there is a target region, draw it on the map
	// if ($scope.step.targetRegion.locationPoints.length === 2) {
	// 	var currentRegion = L.circle($scope.step.targetRegion.locationPoints,$scope.step.targetRegion.radius);
	// 	mapStateMap.addLayer(currentRegion);
	// }
	// var circle;
	// mapStateMap.on('draw:created', function (e) {
	// 	//remove the loaded region then remove any newly drawn circles
 //  	if(currentRegion) mapStateMap.removeLayer(currentRegion);
 //  	if(circle) mapStateMap.removeLayer(circle);
 //  	var type = e.layerType;
 //  	var layer = e.layer;
 //  	//assign target region to properties of drawn object
 //    $scope.mapstate.targetRegion.locationPoints = [layer._latlng.lat,layer._latlng.lng];
 //    $scope.mapstate.targetRegion.radius = layer._mRadius
 //    //declare new object based on propertied drawn and add to map
 //    circle = L.circle([layer._latlng.lat,layer._latlng.lng], layer._mRadius);
 //    mapStateMap.addLayer(circle);
	// });



})
