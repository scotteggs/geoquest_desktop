app.directive('statesList', function(){
	return {
		restrict: 'E',
		scope: {
			'quest': '=quest'
		},
		templateUrl: 'js/common/directives/states-list/states-list.html',
		link: function(scope){
			console.log("quest in states-list", scope.quest)
		}
	}
})