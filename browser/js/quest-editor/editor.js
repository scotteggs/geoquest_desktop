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

app.controller('EditorCtrl', function ($scope, $stateParams, $uibModal, $state, $rootScope, quest, Session, QuestFactory) {
	//variable saved to show/hide quest editor when editing individual states
	$rootScope.editorVisible = true;
	$scope.quest = quest;
	$scope.viewMainMap = true;
	$scope.newQuest = false;
	//if there is no new quest, set properties 
	if(!quest) {
		$scope.newQuest = true;
		$scope.quest= {
			start:  [40.723008,-74.0006327]
		};
	}
	//update quest and go to dashboard for current user
	$scope.saveQuest = function () {
		if(!$scope.newQuest) {
			return QuestFactory.save($scope.quest)		
			.then(function () {
				$state.go('dashboard', {userId: Session.user._id});
			})
		} else {
			return QuestFactory.saveNew($scope.quest)
			.then(function () {
				$state.go('dashboard', {userId: Session.user._id});
			})
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
			})
		} else {
			return QuestFactory.saveNew($scope.quest)
			.then(function (savedQuest) {
				$scope.editorVisible = false;
				$state.go('editor.questStep', {id: savedQuest._id, questStepId: null});
			})
		}
	};

	//***********  MAP FUNCTIONS BELOW  ***********************
		var questMap = L.map('quest-map').setView($scope.quest.start, 13);

		L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
	    maxZoom: 18,
	    id: 'scotteggs.o7614jl2',
	    accessToken: 'pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw'
		}).addTo(questMap);

		var drawnItems = new L.FeatureGroup();
		questMap.addLayer(drawnItems);	

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

		questMap.addControl(drawControl);

		var marker = L.marker($scope.quest.start, {draggable: true});
		questMap.addLayer(marker);

		questMap.on('draw:created', function (e) {
			//	remove any existing markers
		  if (marker) questMap.removeLayer(marker);
		  var type = e.layerType;
		  var layer = e.layer;
		  //save start location of new marker
		  $scope.quest.start = [layer._latlng.lat,layer._latlng.lng];
		  //create marker and add to map
		  marker = L.marker([layer._latlng.lat,layer._latlng.lng], {draggable: true});
		  questMap.addLayer(marker);
		});

		marker.on('dragend', function (e) {
			$scope.quest.start = [e.target._latlng.lat,e.target._latlng.lng];
		})

		if ($scope.newQuest) {
			questMap.locate().on('locationfound', function (e) {
				questMap.setView([e.latitude,e.longitude], 14);
				marker.setLatLng([e.latitude,e.longitude]);
				$scope.quest.start = [e.latitude,e.longitude];
			});
		}

})