app.config(function ($stateProvider) {
    $stateProvider.state('home', {
        url: '/',
        templateUrl: 'js/home/home.html',
        controller: 'HomeCtrl',
        resolve: {
        	games: function(GamesFactory) {
        		return GamesFactory.getAllGames();
        	}
        }
    });
});

app.controller('HomeCtrl', function($scope, games) {
    $scope.games = games;
});