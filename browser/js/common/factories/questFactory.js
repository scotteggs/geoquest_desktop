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
			return $http.get('/api/quests/userquests/' + userId)
			.then(function(res){
				return res.data;
			})
		},
		update: function(quest){
			return $http.put('/api/quests/' + quest._id, quest)
			.then(function (res){
				console.log("response", res)
				return res.data;
			}).catch(function (err){
				console.log(err);
			})
		}

	};
});
