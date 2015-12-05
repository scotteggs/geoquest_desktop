app.factory('QuestFactory', function ($http, Session) {

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
		save: function (quest) {
			return $http.put('/api/quests/' + quest._id, quest)
			.then(function (res){
				return res.data;
			})
		}

	// 	save: function (quest, questIsNew) {
	// 		if (questIsNew) {
	// 			var openingState = quest.mapstates[0]
	// 			quest.mapstates = [];
	// 			return $http.post('/api/mapstates', openingState)
	// 			.then(function (newMapState) {
	// 				quest.mapstates.push(newMapState.data._id);
	// 				quest.author = Session.user._id;
	// 				return $http.post('/api/quests/', quest)
	// 			})
	// 			.then(function (res){
	// 				return res.data;
	// 			}).catch(function (err){
	// 				console.log(err);
	// 			})
	// 		} else {
	// 			return $http.put('/api/quests/' + quest._id, quest)
	// 			.then(function (res){
	// 				return res.data;
	// 			}).catch(function (err){
	// 				console.log(err);
	// 			})
	// 		}
	// 	},
	}
});
