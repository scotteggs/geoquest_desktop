app.factory('GamesFactory', function($http) {

	return {

		getAllGames: function() {
			return $http.get('/api/games')
			.then(function(res) {
				return res.data;
			});
		}

	};
});
// nothnig