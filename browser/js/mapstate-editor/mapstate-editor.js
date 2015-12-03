app.config(function ($stateProvider) {
	$stateProvider.state('editor.mapstate', {
		url: '/mapstate/:mapstateid', 
		templateUrl: 'js/mapstate-editor/mapstate-editor.html',
		controller: 'MapStateEditController',
		resolve: {
			mapstate: function(MapStateFactory, $stateParams) {
				return $stateParams.mapstateid !== "" ?
					MapStateFactory.getOne($stateParams.mapstateid) : 
					undefined;
			},
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


app.controller('MapStateEditController', function ($scope, $state, mapstate, MapStateFactory, quest){
	$scope.mapstate = mapstate;
	$scope.quest = quest;
	
	$scope.switchState = function (clickedState) {
		MapStateFactory.update($scope.mapstate)
		.then(function () {
			console.log(clickedState)
			$state.go('editor.mapstate', {mapstateid: clickedState._id}, {reload: true});	
		})
	}
	var mapView = function () {
		if ($scope.mapstate.targetRegion.locationPoints.length ===2) {
			return($scope.mapstate.targetRegion.locationPoints)
		} else {
			return($scope.quest.start)
		}
	};

	var map = L.map('map').setView(mapView(), 15);

	L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
    maxZoom: 18,
    id: 'scotteggs.o7614jl2',
    accessToken: 'pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw'
	}).addTo(map);

	// Initialise the FeatureGroup to store editable layers
	var drawnItems = new L.FeatureGroup();
	map.addLayer(drawnItems);

	// Initialise the draw control and pass it the FeatureGroup of editable layers
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

	map.addControl(drawControl);
	if ($scope.mapstate.targetRegion.locationPoints.length === 2) {
		var currentRegion = L.circle(mapstate.targetRegion.locationPoints,mapstate.targetRegion.radius);
		map.addLayer(currentRegion);
	}
	var circle;
	map.on('draw:created', function (e) {
		console.log('new');
  	map.removeLayer(currentRegion);
  	if(circle) map.removeLayer(circle);
  	var type = e.layerType;
  	var layer = e.layer;

    var newRegion = {
    	radius: layer._mRadius,
    	locationPoints: [layer._latlng.lat,layer._latlng.lng]
    };
    $scope.mapstate.targetRegion.locationPoints = [layer._latlng.lat,layer._latlng.lng];
    $scope.mapstate.targetRegion.radius = layer._mRadius
    circle = L.circle(newRegion.locationPoints, newRegion.radius);
    // Do whatever else you need to. (save to db, add to map etc)
    map.addLayer(circle);
	});



})









