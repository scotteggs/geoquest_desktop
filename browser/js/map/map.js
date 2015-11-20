
app.config(function ($stateProvider) {

    // Register our *about* state.
    $stateProvider.state('map', {
        url: '/map',
        controller: 'MapController',
        templateUrl: 'js/map/map.html'
    });

});

app.controller('MapController', function ($scope) {
    // make map
    angular.extend($scope, {
        center: {
            autoDiscover: true
        },           
        events: {},
        layers: {
            baselayers: {
                osm: {
                    name: 'MapboxTiles',
                    url: 'https://api.tiles.mapbox.com/v4/scotteggs.o7614jl2/{z}/{x}/{y}.png?access_token=pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw',
                    type: 'xyz'
                }
            }
        },
        defaults: {
            scrollWheelZoom: false
        }
    });







});