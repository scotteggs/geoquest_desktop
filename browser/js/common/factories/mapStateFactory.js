// app.factory('MapStateFactory', function($http) {
// 	return {
// 		getOne: function(mapStateId){
// 			return $http.get('/api/mapstates/' + mapStateId)
// 			.then(function (res){
// 				return res.data;
// 			})
// 		},
// 		update: function(mapstate){
// 			return $http.put('/api/mapstates/' + mapstate._id, mapstate)
// 			.then(function (res){
// 				return res.data;
// 			}).catch(function (err){
// 				console.log(err);
// 			})
// 		}
// 	};
// });
