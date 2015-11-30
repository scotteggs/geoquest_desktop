app.config(function ($stateProvider){
	$stateProvider.state('editor',
	{
		url: '/editor',
		templateUrl: 'js/quest-editor/editor.html',
		controller: 'EditorCtrl',
		data: {
            authenticate: true
        },
        resolve: {
        	quest: function(GamesFactory, $stateParams){
        		console.log("editor resole $stateParams", $stateParams)
        		return $stateParams.gameId ? 
        					GameFactory.getOneGame($stateParams.gameId) :
        					undefined;
        	}
        }
	});
});

app.controller('EditorCtrl', function ($scope, quest) {
	console.log("quest", quest);
})