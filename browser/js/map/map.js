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
            console.log('map object', map);
            map.locate({setView: true, maxZoom: 16, watch: false, enableHighAccuracy: true});
            map.on('locationfound', function (e) {
                console.log(e.latlng, e.accuracy);
            });
        });
    };
    $scope.getLocation();






});