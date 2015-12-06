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

app.controller('EditorCtrl', function ($scope, $stateParams, $uibModal, $state, $rootScope, quest, Session, QuestFactory) {
	//variable saved to show/hide quest editor when editing individual states
	$rootScope.editorVisible = true;
	$scope.quest = quest;
	$scope.newQuest = false;
	//if ther eis no new quest, set properties 
	if(!quest) {
		$scope.newQuest = true;
		$scope.quest= {
			start:  [40.723008,-74.0006327]
		};
		console.log('new quest in controller', $scope.quest)	
	}
	//update quest and go to dashboard for current user
	$scope.saveQuest = function () {
		if(!$scope.newQuest) {
			return QuestFactory.save($scope.quest)		
			.then(function () {
				$state.go('dashboard', {userId: Session.user._id});
			})
		} else {
			console.log("scope.quest within editor", $scope.quest);
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


	
	$scope.editorVisible = true;
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
		if ($scope.quest.start.length === 2) {
			var marker = L.marker($scope.quest.start).bindPopup('Quest Start Location');
			questMap.addLayer(marker);
		}

		//saving marker for removal later
		var currentMarker;
		questMap.on('draw:created', function (e) {
			//	remove the loaded region and any previously drawn markers
		  if (marker) questMap.removeLayer(marker);
		  if (currentMarker) questMap.removeLayer(circle);
		  var type = e.layerType;
		  var layer = e.layer;
		  //save start location of new marker
		  $scope.quest.start = [layer._latlng.lat,layer._latlng.lng];
		  //create marker and add to map
		  marker = L.marker([layer._latlng.lat,layer._latlng.lng]);
		  questMap.addLayer(marker);
		});
})