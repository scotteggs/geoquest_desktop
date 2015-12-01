

app.factory('QuestFactory', function($http) {

	return {

		getAllQuests: function() {
			return $http.get('/api/quests')
			.then(function(res) {
				return res.data;
			});
		},

		getOneQuest: function(questId){
			return $http.get('/api/quests/' + questId)
				.then(function(res){
					return res.data;
				})
		},

		getUserQuests: function(userId) {
			var quests = [
				{
					id: 0,
		            name: 'Tour of Olde Shit',
		            summary: 'Check out cool historical stuff in the area',
		            time: '1.5',
		            distance: '2',
		            start: [40.713031, -74.009896]
		        },
		        {
		        	id: 1,
		            name: 'Kill the Thing',
		            summary: 'Go to the place and stab the monsters.',
		            time: '1',
		            distance: '1.5',
		            start: [66.664463, -150.225470]
		        },
		        {
		        	id: 2,
		            name: 'Save the Princess',
		            summary: 'She\'s being forced into an unsavory marriage',
		            time: '1.5',
		            distance: '3',
		            start: [37.752731, -122.450657]
		        },
		        {
		        	id: 3,
		            name: 'Destroy the ring',
		            summary: '\"Cast it into the fountain!\"',
		            time: '1',
		            distance: '2',
		            start: [40.840256, -73.924791]
		        },
		        {
		        	id: 4,
		            name: 'Ye Classic Drinking Quest',
		            summary: 'Get proper pissed in the friendliest bars in town',
		            time: '???',
		            distance: '1',
		            start: [40.745645, -73.978349]
		        },
		        {
		        	id: 5,
		            name: 'Escape the Trolls!',
		            summary: 'If you seek some exercise',
		            time: '1',
		            distance: '5',
		            start: [40.930791, -74.275668]
		        }
		    ];

			return quests;
			// return $http.get('/api/quests/' + userId)
			// .then(function(res){
			// 	return res.data;
			// })
		}

	};
});
