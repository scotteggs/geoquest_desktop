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
    	},
    },
		data: {
        authenticate: true
    }
	});
});

app.controller('EditorCtrl', function ($scope, $stateParams, $uibModal, $state, quest, Session, QuestFactory) {
	$scope.quest = quest;
	$scope.saveQuest = function () {
		QuestFactory.update($scope.quest)
		.then(function () {
			// console.log(Session.user._id);
			$state.go('dashboard', {userId: Session.user._id});
		})
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

	var map = L.map('map').setView($scope.quest.start, 16);

	L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
    maxZoom: 18,
    id: 'scotteggs.o7614jl2',
    accessToken: 'pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw'
	}).addTo(map);

	var drawnItems = new L.FeatureGroup();
	map.addLayer(drawnItems);	

	// Initialise the draw control and pass it the FeatureGroup of editable layers
	var drawControl = new L.Control.Draw({
	    draw: {
	    	polyline: false,
	    	polygon: false,
	    	rectangle: false,
	    	circle: false
	    },
	    edit: {
	        featureGroup: drawnItems
	    }
	});

	map.addControl(drawControl);
	console.log($scope.quest.start, 'startlocation')
	if ($scope.quest.start.length === 2) {
		var marker = L.marker($scope.quest.start).bindPopup('Quest Start Location');
	map.addLayer(marker);
	}
	var currentMarker;

	map.on('draw:created', function (e) {
		//	remove the loaded region and any previously drawn markers
	  if (marker) map.removeLayer(marker);
	  if (currentMarker) map.removeLayer(circle);
	  var type = e.layerType;
	  var layer = e.layer;
	  //save start location of new marker
	  console.log('current', $scope.quest.start);
	  $scope.quest.start = [layer._latlng.lat,layer._latlng.lng];
	  //create marker and add to map
	  marker = L.marker([layer._latlng.lat,layer._latlng.lng]);
	  map.addLayer(marker);
	  console.log('new', $scope.quest.start);
	});

})