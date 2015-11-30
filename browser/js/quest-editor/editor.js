app.config(function ($stateProvider){
	$stateProvider.state('editor',
	{
		url: '/editor',
		templateUrl: 'js/editor/editor.html',
		controller: 'EditorCtrl',
		data: {
            authenticate: true
        }
	});
});

app.controller('EditorCtrl', function ($scope) {
	$scope.name = "Editor";
})