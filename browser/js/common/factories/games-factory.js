app.factory('GamesFactory', function($http) {

	return {

		getAllGames: function() {
			return $http.get('/api/games')
			.then(function(res) {
				return res.data;
			});
		},

		getUserGames: function(userId) {
			var games = [
				{
		            name: 'Tour of Olde Shit',
		            summary: 'Check out cool historical stuff in the area',
		            time: '1.5',
		            distance: '2',
		            start: [40.713031, -74.009896]
		        },
		        {
		            name: 'Kill the Thing',
		            summary: 'Go to the place and stab the monsters.',
		            time: '1',
		            distance: '1.5',
		            start: [66.664463, -150.225470]
		        },
		        {
		            name: 'Save the Princess',
		            summary: 'She\'s being forced into an unsavory marriage',
		            time: '1.5',
		            distance: '3',
		            start: [37.752731, -122.450657]
		        },
		        {
		            name: 'Destroy the ring',
		            summary: '\"Cast it into the fountain!\"',
		            time: '1',
		            distance: '2',
		            start: [40.840256, -73.924791]
		        },
		        {
		            name: 'Ye Classic Drinking Quest',
		            summary: 'Get proper pissed in the friendliest bars in town',
		            time: '???',
		            distance: '1',
		            start: [40.745645, -73.978349]
		        },
		        {
		            name: 'Escape the Trolls!',
		            summary: 'If you seek some exercise',
		            time: '1',
		            distance: '5',
		            start: [40.930791, -74.275668]
		        }
		    ];

			return games;
			// return $http.get('/api/games/' + userId)
			// .then(function(res){
			// 	return res.data;
			// })
		}

	};
});
// nothnig