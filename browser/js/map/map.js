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
        tiles: {},
        events: {},
    });

    $scope.getLocation = function() {
        leafletData.getMap('map').then(function(map) {
            map.locate({setView: true, maxZoom: 16, watch: false, enableHighAccuracy: true});
            map.on('locationfound', function (e) {
                socket.emit('hereIAm', [e.latitude, e.longitude], e.accuracy);
            });
        });
    };
    $scope.getLocation();

    socket.on('fellowLocation', function(location, accuracy) {
        alert('you have a friend at latitude ' + location[0] + ' and longitude ' + location[1] + 
            ' with a location accuracy of ' + accuracy + ' , whatever that means.');
    });




});