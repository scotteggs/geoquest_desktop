app.config(function ($stateProvider) {

    // Register our *about* state.
    $stateProvider.state('about', {
        url: '/about',
        controller: 'AboutController',
        templateUrl: 'js/about/about.html'
    });

});

app.controller('AboutController', function ($scope, leafletData) {
    // make map by addn some sh*t to the MF $scope!
    angular.extend($scope, {
        center: {
            autoDiscover: true
        },
        events: {},
        defaults: {
                    tileLayer: "https://api.tiles.mapbox.com/v4/scotteggs.o7614jl2/{z}/{x}/{y}.png",
                    zoomControlPosition: 'topright',
                    tileLayerOptions: {
                        opacity: 0.9,
                        detectRetina: true,
                        reuseTiles: true,
                    },
                    scrollWheelZoom: false
                },
        defaults: {
            scrollWheelZoom: false
        }
    });

    $scope.getLocation = function() {
        leafletData.getMap('map').then(function(map) {
            map.locate({setView: true, maxZoom: 16, watch: true, enableHighAccuracy: true});
            map.on('locationfound', function (e) {
                console.log(e.latlng, e.accuracy);
            });
        });
    };
    $scope.getLocation();


});