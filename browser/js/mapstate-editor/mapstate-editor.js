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
			}
		},
		data: {
      authenticate: true
    }
	})
})


app.controller('MapStateEditController', function ($scope, mapstate, MapStateFactory){
	$scope.mapstate = mapstate;
	$scope.update = function () {
		MapStateFactory.update($scope.mapstate)
	}

	var map = L.map('map', {drawControl: true}).setView([40.712655,-74.004928], 15);

	L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
    maxZoom: 18,
    id: 'scotteggs.o7614jl2',
    accessToken: 'pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw'
	}).addTo(map);



})