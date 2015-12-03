app.directive('stateEditor', function(){
	return {
		restrict: 'E',
		scope: {
			'quest': '=quest'
		},
		templateUrl: 'js/common/directives/state-editor/state-editor.html',
		link: function(scope){
			var map = L.map('map', {drawControl: true}).setView(scope.quest.start, 15);

			L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
        maxZoom: 18,
        id: 'scotteggs.o7614jl2',
        accessToken: 'pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw'
    	}).addTo(map);

    	console.log(scope.quest.start, "starting point")
		}
	}
})

