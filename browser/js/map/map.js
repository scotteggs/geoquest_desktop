app.config(function ($stateProvider) {

    // Register our *about* state.
    $stateProvider.state('map', {
        url: '/map',
        controller: 'MapController',
        templateUrl: 'js/map/map.html'
    });

});



app.controller('MapController', function ($scope, leafletData) {
    // make map by addn some sh*t to the MF $scope!
    angular.extend($scope, {
        center: {
            autoDiscover: true
        },
        events: {},
    });

    $scope.getLocation = function() {
        leafletData.getMap('map').then(function(map) {
            L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
                maxZoom: 18,
                id: 'scotteggs.o7614jl2',
                accessToken: 'pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw'
            }).addTo(map);
            var polygon1 = L.polygon([
                [40.705156, -74.010013],
                [40.705280, -74.009059],
                [40.704871, -74.008855],
                [40.704570, -74.009466]
            ]).addTo(map);
            var polygon2 = L.polygon([
                [40.705305, -74.009000],
                [40.704910, -74.008836],
                [40.705364, -74.008118],
                [40.705378, -74.008287]
            ]).addTo(map);

            map.locate({
                setView: true, 
                maxZoom: 20, 
                watch: true,
                zoom: 20, 
                enableHighAccuracy: true
            });
            map.on('locationfound', function (e) {
                socket.emit('hereIAm', [e.latitude, e.longitude], e.accuracy);
            });
        });

    };
    $scope.getLocation();

    socket.on('fellowLocation', function(location, accuracy) {
        alert('You have a fellow fellow at latitude ' + location[0] + ' and longitude ' 
            + location[1] + ' with an accuracy of ' + accuracy);
    });




});