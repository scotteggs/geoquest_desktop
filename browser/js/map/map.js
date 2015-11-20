app.config(function ($stateProvider) {

    // Register our *about* state.
    $stateProvider.state('map', {
        url: '/map',
        controller: 'MapController',
        templateUrl: 'js/map/map.html'
    });

});



app.controller('MapController', function ($scope, leafletData) {
    $scope.map = L.map('map');
    $scope.me = {};
    $scope.fellows = []; 

    L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
        maxZoom: 18,
        id: 'scotteggs.o7614jl2',
        accessToken: 'pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw'
    }).addTo($scope.map);
    var polygon1 = L.polygon([
        [40.705156, -74.010013],
        [40.705280, -74.009059],
        [40.704871, -74.008855],
        [40.704570, -74.009466]
    ]).addTo($scope.map);
    var polygon2 = L.polygon([
        [40.705305, -74.009000],
        [40.704910, -74.008836],
        [40.705364, -74.008118],
        [40.705378, -74.008287]
    ]).addTo($scope.map);

    $scope.map.locate({
        setView: true, 
        maxZoom: 20, 
        watch: true,
        zoom: 16, 
        enableHighAccuracy: true
    });
    $scope.map.on('locationfound', function (e) {
        $scope.me.location = e.latlng;

        if (!$scope.myMarker) {
            var meIcon = L.icon({
                iconUrl: 'http://s17.postimg.org/wrmvxxo1r/map_logo.png',
                iconSize:     [38, 38], // size of the icon
                iconAnchor:   [22, 38], // point of the icon which will correspond to marker's location
                popupAnchor:  [-3, -76] // point from which the popup should open relative to the iconAnchor
            });
            $scope.myMarker = new L.marker($scope.me.location, {icon: meIcon});
            $scope.map.addLayer($scope.myMarker);
        } else {
            $scope.myMarker.setLatLng($scope.me.location);
        }
        socket.emit('hereIAm', $scope.me.location);
    });

    socket.on('fellowLocation', function(fellow) {
        if (fellow.id === $scope.me.id) return;
        for (var i=0; i<$scope.fellows.length; i++) {
            if(fellow.id === $scope.fellows[i].id) {
                $scope.fellows[i].location = fellow.location;
                $scope.fellows[i].marker.setLatLng($scope.fellows[i].location);
                return;
            }
        }
        var newFellow = fellow;
        newFellow.marker = new L.marker(newFellow.location);
        $scope.map.addLayer(newFellow.marker);
        $scope.fellows.push(newFellow);
    });

    socket.on('death', function(id) {
        var index;
        for (var i=0; i< $scope.fellows.length; i++) {
            if($scope.fellows[i].id === id) {
                $scope.map.removeLayer($scope.fellows[i].marker);
                index = i;
            }
        }
        $scope.fellows.splice(index,1);
    });

    socket.on('yourId', function(id) {
        $scope.me.id = id;
    });

    socket.on('yourFellows', function (everyone) {
        for (var i=0; i< everyone.length; i++) {
            var newFellow = everyone[i];
            newFellow.marker = new L.marker(newFellow.location);
            $scope.map.addLayer(newFellow.marker);
            $scope.fellows.push(newFellow);
        }
    });



});




